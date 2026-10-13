// Differential test against the original cfb@1.2.2.
//
//   node scripts/differential.mjs <corpus-dir>... [--mutations N] [--seed N]
//        [--max-mutation-size BYTES] [--timeout MS] [--limit N] [--report FILE]
//        [--workers N] [--heap MB] [--local FILE] [--upstream FILE]
//        [--min-size BYTES] [--max-size BYTES] [--sequential] [--read-only]
//        [--rss-limit-mb MB] [--match REGEXP] [--save DIR]
//
// Every CFB, ZIP, or MIME container in the corpus (and, with --mutations, N
// deterministic corruptions of each small input) is processed by both
// implementations in isolated child processes with time and memory limits. Results
// must be identical wherever cfb@1.2.2 finishes; where it hangs or runs out of
// memory, this package must finish. Names of 32 or more characters written to
// CFB, an intentional difference, are reported as long-name. The intentional
// differences on damaged input listed in docs/COMPATIBILITY.md still report as
// regressions and are reviewed by hand. Counts are per input; the exit code is
// 1 when any input is a regression or fails only in this package.
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerUrl = new URL('./differential-worker.mjs', import.meta.url);

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const [value] = args.splice(index, 2).slice(1);
  return value;
};
const mutations = Number(option('mutations', 0));
const seed = Number(option('seed', 0x5eed));
const maxMutationSize = Number(option('max-mutation-size', 262144));
const timeout = Number(option('timeout', 30000));
const limit = Number(option('limit', Infinity));
const reportFile = option('report', '');
const heap = Number(option('heap', 512));
const rssLimit = Number(option('rss-limit-mb', 1536)) * 1024 * 1024;
const minSize = Number(option('min-size', 0));
const maxSize = Number(option('max-size', Infinity));
const flag = (name) => (args.includes(`--${name}`) ? Boolean(args.splice(args.indexOf(`--${name}`), 1)) : false);
const sequential = flag('sequential');
const readOnly = flag('read-only');
const poolSize = Number(option('workers', Math.max(1, Math.min(3, Math.floor(availableParallelism() / 2)))));
const labelFilter = new RegExp(option('match', ''));
const saveDirectory = option('save', '');
if (saveDirectory) mkdirSync(saveDirectory, { recursive: true });
const upstreamOption = option('upstream', '');
const localOption = option('local', '');
const corpora = args.length > 0 ? args : [process.env.CFB_CORPUS].filter(Boolean);
if (corpora.length === 0) {
  console.error('Usage: node scripts/differential.mjs <corpus-dir>... (or set CFB_CORPUS)');
  process.exit(2);
}

const upstream = path.resolve(upstreamOption || require.resolve('cfb', { paths: [root] }));
const local = path.resolve(localOption || path.join(root, 'cfb.js'));

function signature(file) {
  const handle = openSync(file, 'r');
  const head = Buffer.alloc(16);
  readSync(handle, head, 0, 16, 0);
  closeSync(handle);
  if (head.readUInt32BE(0) === 0xd0cf11e0) return 'cfb';
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  if (head.toString('latin1', 0, 12) === 'MIME-Version') return 'mime';
  return null;
}

function collect(directory, files) {
  for (const name of readdirSync(directory).sort()) {
    if (name === '.git' || name === 'node_modules') continue;
    const file = path.join(directory, name);
    const info = statSync(file);
    if (info.isDirectory()) collect(file, files);
    else if (info.isFile() && info.size > minSize && info.size <= maxSize && signature(file)) files.push(file);
  }
  return files;
}

const children = new Set();
function stopChildren() {
  for (const child of children) child.kill('SIGKILL');
}
process.on('exit', stopChildren);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren();
    process.exit(130);
  });
}

class Pool {
  constructor(implementation, size, readOnly) {
    this.implementation = implementation;
    this.readOnly = readOnly;
    this.idle = [];
    this.queue = [];
    for (let index = 0; index < size; index += 1) this.idle.push(this.spawn());
  }

  spawn() {
    const child = fork(fileURLToPath(workerUrl), [this.implementation, this.readOnly ? 'read-only' : 'full'], {
      execArgv: [`--max-old-space-size=${heap}`],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    children.add(child);
    child.on('exit', () => children.delete(child));
    return child;
  }

  // Buffers live outside the V8 heap limit, so watch the real resident size.
  rss(worker) {
    try {
      const status = readFileSync(`/proc/${worker.pid}/status`, 'utf8');
      const match = /VmRSS:\s+(\d+) kB/.exec(status);
      return match ? Number(match[1]) * 1024 : 0;
    } catch {
      return 0;
    }
  }

  run(task) {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.next();
    });
  }

  next() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop();
      const { task, resolve } = this.queue.shift();
      let settled = false;
      const onMessage = (message) => {
        if (message.id === task.id) finish(message.result, false);
      };
      const onError = (error) => finish({ failure: `crash: ${error.code || error.message}` }, true);
      const onExit = (code) => finish({ failure: `exit ${code}` }, true);
      const finish = (result, replace) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(watchdog);
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
        if (replace) {
          worker.kill('SIGKILL');
          this.idle.push(this.spawn());
        } else {
          this.idle.push(worker);
        }
        resolve(result);
        this.next();
      };
      const timer = setTimeout(() => finish({ failure: 'timeout' }, true), timeout);
      const watchdog = setInterval(() => {
        if (this.rss(worker) > rssLimit) finish({ failure: 'memory' }, true);
      }, 100);
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);
      worker.send(task);
    }
  }

  close() {
    for (const worker of this.idle) worker.kill();
  }
}

function random(state) {
  let value = state >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const pointerValues = [0xfffffffe, 0xffffffff, 0xfffffffd, 0xfffffffc, 0, 1, 2, 0x7fffffff, 0x10000];

function mutate(bytes, rng) {
  const out = Buffer.from(bytes);
  const edits = 1 + Math.floor(rng() * 6);
  for (let edit = 0; edit < edits; edit += 1) {
    const span = rng() < 0.6 ? Math.min(out.length, 4096) : out.length;
    const offset = Math.floor(rng() * span);
    if (rng() < 0.4 && offset + 4 <= out.length) {
      out.writeUInt32LE(pointerValues[Math.floor(rng() * pointerValues.length)] >>> 0, offset & ~3);
    } else {
      out[offset] = Math.floor(rng() * 256);
    }
  }
  return out;
}

// cfb@1.2.2 writes names of 32 or more characters with an invalid 66-byte
// length field; this package writes 31 characters (js-cfb#18). Read back, the
// reader drops NUL characters, and cfb@1.2.2 gains one character from the
// length field, so each such name from this package is the other one minus
// one or two trailing characters. Those writes are intentional, not regressions.
const sameLongName = (upstreamName, localName) => upstreamName === localName
  || (upstreamName.startsWith(localName) && upstreamName.length - localName.length <= 2);

function sameExceptLongNames(left, right) {
  if (left.fullPaths.length !== right.fullPaths.length || left.raw !== right.raw) return false;
  for (let index = 0; index < left.fullPaths.length; index += 1) {
    const upstreamPath = left.fullPaths[index].split('/');
    const localPath = right.fullPaths[index].split('/');
    if (upstreamPath.length !== localPath.length) return false;
    if (!upstreamPath.every((segment, at) => sameLongName(segment, localPath[at]))) return false;
    const { name: upstreamName, ...upstreamEntry } = left.entries[index];
    const { name: localName, ...localEntry } = right.entries[index];
    if (!sameLongName(String(upstreamName), String(localName))) return false;
    if (JSON.stringify(upstreamEntry) !== JSON.stringify(localEntry)) return false;
  }
  return true;
}

function longNameWrite(operation, left, right, read) {
  if (!left.ok || !right.ok || !read || !read.ok) return false;
  if (!read.value.entries.some((entry) => String(entry.name).length > 31)) return false;
  if (operation === 'writeCfb') return JSON.stringify(left.value.after) === JSON.stringify(right.value.after);
  if (operation === 'roundtrip') return sameExceptLongNames(left.value, right.value);
  return false;
}

function classify(upstreamResult, localResult) {
  if (localResult.failure && upstreamResult.failure) return 'both-failed';
  if (localResult.failure) return 'local-failure';
  if (upstreamResult.failure) return 'upstream-failure-fixed';
  const outcomes = [];
  for (const operation of Object.keys({ ...upstreamResult, ...localResult })) {
    const left = upstreamResult[operation];
    const right = localResult[operation];
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    if (left && right && !left.ok && !right.ok) outcomes.push(`error-text:${operation}`);
    else if (left && right && longNameWrite(operation, left, right, localResult.read)) outcomes.push(`long-name:${operation}`);
    else if (left && left.ok) outcomes.push(`regression:${operation}`);
    else outcomes.push(`local-accepts:${operation}`);
  }
  return outcomes.length === 0 ? 'identical' : outcomes.join(' ');
}

// One class per input, most severe first.
const severity = ['regression', 'local-failure', 'both-failed', 'upstream-failure-fixed', 'local-accepts', 'error-text', 'long-name', 'identical'];
const inputClass = (outcome) => {
  const parts = outcome.split(' ').map((part) => part.split(':')[0]);
  return severity.find((name) => parts.includes(name));
};

const files = collect(path.resolve(corpora[0]), []);
for (const extra of corpora.slice(1)) collect(path.resolve(extra), files);
const selected = files.slice(0, limit);
const workers = poolSize;
const upstreamPool = new Pool(upstream, workers, readOnly);
const localPool = new Pool(local, workers, readOnly);
const counts = {};
const findings = [];
let processed = 0;

async function compare(label, task) {
  const [upstreamResult, localResult] = sequential
    ? [await upstreamPool.run(task), await localPool.run(task)]
    : await Promise.all([upstreamPool.run(task), localPool.run(task)]);
  const outcome = classify(upstreamResult, localResult);
  const kind = inputClass(outcome);
  counts[kind] = (counts[kind] || 0) + 1;
  if (outcome !== 'identical') {
    findings.push({ label, outcome, upstream: upstreamResult, local: localResult });
  }
  processed += 1;
  if (processed % 250 === 0) console.error(`${processed} inputs compared`);
}

const inFlight = new Set();
let id = 0;
async function schedule(label, task) {
  while (inFlight.size >= workers * 2) await Promise.race(inFlight);
  const running = compare(label, task).finally(() => inFlight.delete(running));
  inFlight.add(running);
}

for (const file of selected) {
  const label = path.relative(path.resolve(corpora[0]), file);
  if (labelFilter.test(label)) await schedule(label, { id: (id += 1), file });
  if (mutations > 0 && statSync(file).size <= maxMutationSize) {
    const bytes = readFileSync(file);
    const fileSeed = createHash('sha256').update(label).digest().readUInt32LE(0) ^ seed;
    const rng = random(fileSeed);
    for (let index = 0; index < mutations; index += 1) {
      // Every mutation is generated so that --match keeps the same sequence.
      const mutated = mutate(bytes, rng);
      if (!labelFilter.test(`${label}#mutation${index}`)) continue;
      // --save keeps the corrupted input for reproducing a finding.
      if (saveDirectory) writeFileSync(path.join(saveDirectory, `${label}#mutation${index}`.replace(/[\/#]/g, '_')), mutated);
      await schedule(`${label}#mutation${index}`, { id: (id += 1), bytes: mutated.toString('base64') });
    }
  }
}
await Promise.all(inFlight);
await Promise.all([upstreamPool.close(), localPool.close()]);

const summary = {
  inputs: processed,
  files: selected.length,
  mutationsPerFile: mutations,
  seed,
  counts
};
console.log(JSON.stringify(summary, null, 2));
if (reportFile) writeFileSync(reportFile, `${JSON.stringify({ summary, findings }, null, 2)}\n`);
const blocking = findings.filter((finding) => /regression|local-failure/.test(finding.outcome));
const bothFailed = findings.filter((finding) => finding.outcome === 'both-failed');
for (const finding of bothFailed.slice(0, 20)) {
  console.error(`both-failed (${finding.local.failure})  ${finding.label}`);
}
for (const finding of blocking.slice(0, 20)) {
  console.error(`${finding.outcome}  ${finding.label}`);
}
process.exitCode = blocking.length > 0 ? 1 : 0;
