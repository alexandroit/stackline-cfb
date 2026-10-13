// Child process that runs one implementation of the CFB API against inputs
// sent by differential.mjs and returns a deterministic digest of every
// observable result.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [implementation, mode] = process.argv.slice(2);
const workerData = { implementation, readOnly: mode === 'read-only' };
const CFB = require(workerData.implementation);

function hash(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex').slice(0, 32);
}

function time(value) {
  if (value === undefined || value === null) return value;
  return value instanceof Date ? value.getTime() : `non-date:${String(value)}`;
}

function describeEntry(entry) {
  const out = { keys: Object.keys(entry).join(',') };
  for (const key of ['name', 'type', 'size', 'start', 'clsid', 'state', 'color', 'L', 'R', 'C', 'storage', 'ctype']) {
    if (key in entry) out[key] = entry[key];
  }
  out.ct = time(entry.ct);
  out.mt = time(entry.mt);
  const content = entry.content;
  out.content = content === undefined || content === null
    ? String(content)
    : `${content.length}:${hash(content)}`;
  return out;
}

function describe(container) {
  return {
    fullPaths: container.FullPaths,
    entries: container.FileIndex.map(describeEntry),
    raw: container.raw ? hash(container.raw.header || []) : undefined
  };
}

function attempt(run) {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return {
      ok: false,
      error: `${error && error.constructor ? error.constructor.name : typeof error}: ${error && error.message}`
    };
  }
}

function digest(input) {
  const read = () => CFB.read(input, { type: 'buffer' });
  const result = { read: attempt(() => describe(read())) };
  if (!result.read.ok || workerData.readOnly) return result;

  result.find = attempt(() => {
    const container = read();
    return container.FullPaths.slice(0, 40).map((path) => {
      const found = CFB.find(container, path);
      return found ? container.FileIndex.indexOf(found) : -1;
    });
  });
  for (const [name, options] of [
    ['writeCfb', { type: 'buffer' }],
    ['writeZip', { type: 'buffer', fileType: 'zip' }],
    ['writeZipDeflate', { type: 'buffer', fileType: 'zip', compression: true }]
  ]) {
    result[name] = attempt(() => {
      const container = read();
      const bytes = CFB.write(container, options);
      return { output: `${bytes.length}:${hash(bytes)}`, after: describe(container) };
    });
  }
  result.roundtrip = attempt(() => {
    const bytes = CFB.write(read(), { type: 'buffer' });
    return describe(CFB.read(bytes, { type: 'buffer' }));
  });
  return result;
}

process.on('message', (task) => {
  const input = task.bytes ? Buffer.from(task.bytes, 'base64') : readFileSync(task.file);
  process.send({ id: task.id, result: digest(input) });
});
