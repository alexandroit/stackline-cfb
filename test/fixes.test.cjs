// Regression tests for the fixes on top of cfb@1.2.2. Where the original
// finishes, its result is asserted too, so each difference stays explicit.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const test = require('node:test');
const crc32 = require('crc-32');
const CFB = require('../cfb.js');
const Upstream = require('cfb');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const quietly = (run) => {
  const original = console.error;
  console.error = () => {};
  try { return run(); } finally { console.error = original; }
};

/* Runs a snippet against this package in a child process, so a regression to
   an endless loop fails the test instead of hanging it. */
function bounded(snippet) {
  const script = `const CFB=require(${JSON.stringify(require.resolve('../cfb.js'))});${snippet}`;
  const child = spawnSync(process.execPath, ['-e', script], {timeout: 5000, encoding: 'utf8'});
  assert.ifError(child.error);
  return child;
}

/* Directory entries of a version 3 compound file, read through the FAT. */
function directory(buffer) {
  const size = 1 << buffer.readUInt16LE(30);
  const fatSectors = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = buffer.readInt32LE(76 + 4 * index);
    if (sector < 0) break;
    fatSectors.push(sector);
  }
  const fat = [];
  for (const sector of fatSectors) {
    for (let offset = 0; offset < size; offset += 4) fat.push(buffer.readInt32LE((sector + 1) * size + offset));
  }
  const chain = [];
  for (let sector = buffer.readInt32LE(48); sector >= 0; sector = fat[sector]) chain.push(sector);
  const offsets = [];
  for (const sector of chain) {
    for (let offset = 0; offset < size; offset += 128) offsets.push((sector + 1) * size + offset);
  }
  return offsets;
}

function entryName(buffer, offset) {
  const length = buffer.readUInt16LE(offset + 64);
  return length ? buffer.toString('utf16le', offset, offset + length - 2) : '';
}

/* Rewrites the directory with its entries in a new order, keeping links. */
function reorderDirectory(buffer, names) {
  const offsets = directory(buffer);
  const records = offsets.map((offset) => Buffer.from(buffer.subarray(offset, offset + 128)));
  const used = records.map((record, index) => ({record, index, name: entryName(buffer, offsets[index])}));
  const order = names.map((name) => used.find((entry) => entry.name === name).index);
  for (const entry of used) if (!order.includes(entry.index)) order.push(entry.index);
  const moved = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const out = Buffer.from(buffer);
  order.forEach((oldIndex, newIndex) => {
    const record = Buffer.from(records[oldIndex]);
    for (const field of [68, 72, 76]) {
      const link = record.readInt32LE(field);
      if (link >= 0) record.writeInt32LE(moved.get(link), field);
    }
    record.copy(out, offsets[newIndex]);
  });
  return out;
}

/* A minimal ZIP writer for stored entries with optional ZIP64 records. */
function buildZip(entries, {centralZip64 = false, endZip64 = false} = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name);
    const crc = crc32.buf(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const extra = Buffer.alloc(centralZip64 ? 28 : 0);
    if (centralZip64) {
      extra.writeUInt16LE(0x0001, 0); extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(data.length), 4);
      extra.writeBigUInt64LE(BigInt(data.length), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(45, 4); central.writeUInt16LE(45, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(centralZip64 ? 0xFFFFFFFF : data.length, 20);
    central.writeUInt32LE(centralZip64 ? 0xFFFFFFFF : data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(centralZip64 ? 0xFFFFFFFF : offset, 42);
    centrals.push(central, nameBytes, extra);
    offset += 30 + nameBytes.length + data.length;
  }
  const directoryBytes = Buffer.concat(centrals);
  const tail = [];
  if (endZip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0); record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12); record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(entries.length), 24); record.writeBigUInt64LE(BigInt(entries.length), 32);
    record.writeBigUInt64LE(BigInt(directoryBytes.length), 40); record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + directoryBytes.length), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(endZip64 ? 0xFFFF : entries.length, 8); end.writeUInt16LE(endZip64 ? 0xFFFF : entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(endZip64 ? 0xFFFFFFFF : offset, 16);
  return Buffer.concat([...locals, directoryBytes, ...tail, end]);
}

const contents = (container) => Object.fromEntries(container.FullPaths.slice(1)
  .map((fullPath, index) => [fullPath.slice(container.FullPaths[0].length), container.FileIndex[index + 1]])
  .filter(([name, entry]) => entry.type === 2 && name !== '\u0001Sh33tJ5')
  .map(([name, entry]) => [name, Buffer.from(entry.content).toString()]));

test('entries listed before their parent storage keep their full path (js-cfb#15)', () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, '/some folder/some file 1', Buffer.from('one'));
  CFB.utils.cfb_add(container, '/some folder/some file 2', Buffer.from('two'));
  const written = Buffer.from(CFB.write(container, {type: 'buffer'}));
  const reordered = reorderDirectory(written, ['Root Entry', 'some file 1', 'some file 2', 'some folder']);

  const expected = ['Root Entry/some folder/some file 1', 'Root Entry/some folder/some file 2'];
  const result = CFB.read(reordered, {type: 'buffer'});
  for (const fullPath of expected) assert.ok(result.FullPaths.includes(fullPath), fullPath);
  assert.equal(Buffer.from(CFB.find(result, '/some folder/some file 2').content).toString(), 'two');

  const original = Upstream.read(reordered, {type: 'buffer'});
  assert.ok(original.FullPaths.includes('some file 2'), 'cfb@1.2.2 loses the parent of the second file');
});

test('a stream whose child link points at itself keeps its siblings under the root', () => {
  const container = CFB.utils.cfb_new();
  for (const name of ['a', 'b', 'c']) CFB.utils.cfb_add(container, `/${name}`, Buffer.from(name));
  const buffer = Buffer.from(CFB.write(container, {type: 'buffer', noseed: true}));
  const offsets = directory(buffer);
  const first = offsets.findIndex((offset) => entryName(buffer, offset) === 'a');
  buffer.writeInt32LE(first, offsets[first] + 76);

  const result = CFB.read(buffer, {type: 'buffer'});
  assert.deepEqual(result.FullPaths.filter((fullPath) => fullPath !== '/'), ['Root Entry/', 'Root Entry/a', 'Root Entry/b', 'Root Entry/c']);
  assert.equal(Buffer.from(CFB.find(CFB.read(CFB.write(result, {type: 'buffer'}), {type: 'buffer'}), '/c').content).toString(), 'c');

  const original = Upstream.read(buffer, {type: 'buffer'});
  assert.ok(original.FullPaths.includes('a'), 'cfb@1.2.2 drops the root from the path');
});

test('parent links that form a cycle raise a descriptive error', () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, '/a/x', Buffer.from('1'));
  const buffer = Buffer.from(CFB.write(container, {type: 'buffer'}));
  const offsets = directory(buffer);
  const index = (name) => offsets.findIndex((offset) => entryName(buffer, offset) === name);
  buffer.writeInt32LE(index('a'), offsets[index('x')] + 76);

  assert.throws(() => CFB.read(buffer, {type: 'buffer'}), /Directory tree cycle/);
  assert.throws(() => Upstream.read(buffer, {type: 'buffer'}), RangeError);
});

test('truncated DEFLATE streams that would never end fail promptly', () => {
  for (const bytes of [[0x00], [0x02], [0x04, 0x00]]) {
    const child = bounded(`try{CFB.utils._inflateRaw(Object.assign(Buffer.from(${JSON.stringify(bytes)}),{l:0}));process.exitCode=1}catch(e){if(!/Unexpected end of DEFLATE stream|Invalid DEFLATE/.test(e.message))throw e}`);
    assert.equal(child.status, 0, `${JSON.stringify(bytes)}: ${child.stderr}`);
  }
});

test('truncated DEFLATE streams that the original completes give the same output', () => {
  const full = zlib.deflateRawSync(Buffer.from('hello hello hello hello'), {level: 9});
  for (let cut = 1; cut < full.length; cut += 1) {
    const input = full.subarray(0, full.length - cut);
    const run = (library) => {
      try { return Buffer.from(library.utils._inflateRaw(Object.assign(Buffer.from(input), {l: 0}))).toString('hex'); } catch (e) { return `error:${e.message}`; }
    };
    const current = run(CFB);
    /* the new errors only replace inputs on which cfb@1.2.2 never returns */
    if (/Unexpected end|Invalid DEFLATE/.test(current)) continue;
    assert.equal(current, run(Upstream), `cut ${cut}`);
  }
});

/* Fills every uninitialized buffer with 0xAA, so leftover memory is visible. */
function withMarkedMemory(run) {
  const allocUnsafe = Buffer.allocUnsafe;
  Buffer.allocUnsafe = (size) => allocUnsafe(size).fill(0xaa);
  try { return run(); } finally { Buffer.allocUnsafe = allocUnsafe; }
}

test('a DEFLATE stream shorter than its declared size does not expose uninitialized memory', () => {
  const stream = zlib.deflateRawSync(Buffer.from('short'));
  const inflate = (library) => withMarkedMemory(() => Buffer.from(library.utils._inflateRaw(Object.assign(Buffer.from(stream), {l: 0}), 64)));
  const current = inflate(CFB);
  assert.equal(current.length, 64);
  assert.equal(current.subarray(0, 5).toString(), 'short');
  assert.deepEqual([...new Set(current.subarray(5))], [0]);
  const original = inflate(Upstream);
  assert.equal(original.subarray(0, 5).toString(), 'short');
  assert.deepEqual([...new Set(original.subarray(5))], [0xaa], 'cfb@1.2.2 returns the uninitialized rest');
});

test('damaged DEFLATE data decodes as in cfb@1.2.2, also after other streams', () => {
  /* a corrupted dynamic block that reaches bit patterns no code uses */
  const corrupt = '7crHFYMwEEDBVr4bVXM2dMGBBggLEmlBIFL1bsJHzXlSI0zeFi25022g0p3G9+OMruJYjNBl50Gp9ZU05JBD/ndOsqKlP8h1Z7OLobKrUOopA52dvDoaX88XbvfH8/X+fKP4Bw==';
  const earlier = '7dVBCoAgEEbhq8gcIHX/OxJ0EQmhoBJG0Y4frbpDzO4tvv1DvM/D9Cx1L1cgPzmKjLrl3JbUEkPKMBLIE2N9Y/ZkWqBKjM4OtjPsyrBShmLFihUrVvw7bL8nPg==';
  /* each library starts in a fresh process, decodes the corrupt stream, then
     a valid one, then the corrupt stream again */
  const results = (library) => {
    const script = `const C=require(${JSON.stringify(library)});
      const decode=(text)=>{const b=Buffer.from(text,'base64');b.l=0;return Buffer.from(C.utils._inflateRaw(b)).toString('hex')};
      const fresh=decode(${JSON.stringify(corrupt)});decode(${JSON.stringify(earlier)});
      console.log(JSON.stringify([fresh, decode(${JSON.stringify(corrupt)})]));`;
    const child = spawnSync(process.execPath, ['-e', script], {timeout: 5000, encoding: 'utf8'});
    assert.ifError(child.error);
    return JSON.parse(child.stdout);
  };
  /* cfb@1.2.2 reuses Huffman table entries left by earlier streams; some
     damaged files decode only through them, so the behavior is kept */
  const [originalFresh, originalAfter] = results(require.resolve('cfb'));
  assert.notEqual(originalAfter, originalFresh);
  assert.deepEqual(results(require.resolve('../cfb.js')), [originalFresh, originalAfter]);
});

test('a ZIP entry larger than its compressed stream does not expose uninitialized memory', () => {
  /* The data descriptor signature turns the CRC mismatch into a warning, so
     the entry is returned with its declared size. */
  const name = Buffer.from('entry.txt');
  const data = zlib.deflateRawSync(Buffer.from('short'));
  const crc = crc32.buf(Buffer.from('short')) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(64, 22); local.writeUInt16LE(name.length, 26);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(data.length, 8); descriptor.writeUInt32LE(64, 12);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(64, 24); central.writeUInt16LE(name.length, 28);
  const records = Buffer.concat([local, name, data, descriptor]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(records.length, 16);
  const zip = Buffer.concat([records, central, name, end]);

  const content = (library) => withMarkedMemory(() => quietly(() => Buffer.from(library.find(library.read(zip, {type: 'buffer'}), 'entry.txt').content)));
  const current = content(CFB);
  assert.equal(current.subarray(0, 5).toString(), 'short');
  assert.deepEqual([...new Set(current.subarray(5))], [0]);
  assert.deepEqual([...new Set(content(Upstream).subarray(5))], [0xaa], 'cfb@1.2.2 returns the uninitialized rest');
});

test('ZIP dates are read the same on every day of the month', () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, 'a.txt', Buffer.from('x'));
  CFB.find(container, 'a.txt').mt = new Date(2026, 8, 15, 10, 20, 30);
  const zip = CFB.write(container, {type: 'buffer', fileType: 'zip'});

  const readOn = (file, now) => {
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...values) { if (values.length === 0) super(now); else super(...values); }
      static now() { return now; }
    }
    const context = vm.createContext({Date: FakeDate, Buffer, console, module: {exports: {}}, require});
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const mt = context.module.exports.find(context.module.exports.read(zip, {type: 'buffer'}), 'a.txt').mt;
    return [mt.getFullYear(), mt.getMonth() + 1, mt.getDate(), mt.getHours(), mt.getMinutes(), mt.getSeconds()];
  };
  const october31 = new Date(2026, 9, 31, 12).getTime();
  assert.deepEqual(readOn(require.resolve('../cfb.js'), october31), [2026, 9, 15, 10, 20, 30]);
  assert.deepEqual(readOn(require.resolve('cfb'), october31), [2026, 10, 15, 10, 20, 30], 'cfb@1.2.2 shifts the month');
  assert.deepEqual(readOn(require.resolve('cfb'), new Date(2026, 9, 13).getTime()), [2026, 9, 15, 10, 20, 30]);
});

test('MIME header lines are matched in linear time (CVE-2024-22363 pattern)', () => {
  const header = ':'.repeat(200000) + '\n';
  const mad = 'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="b"\r\n\r\n--b\r\n' + header +
    '\r\nContent-Transfer-Encoding: base64\r\n\r\nQQ==\r\n--b--\r\n';
  const started = Date.now();
  try { CFB.read(Buffer.from(mad, 'binary'), {type: 'buffer'}); } catch (error) { /* the part has no name */ }
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);

  const line = 'Content-Location: file:///C:/a.htm';
  assert.deepEqual(line.match(/^([^:]*?):\s*([^\s].*)$/).slice(1), line.match(/^(.*?):\s*([^\s].*)$/).slice(1));
});

test('long stream names are stored in the 31 characters the format allows (js-cfb#18)', () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, 'N'.repeat(40), Buffer.from('y'));
  const written = Buffer.from(quietly(() => CFB.write(container, {type: 'buffer'})));
  for (const offset of directory(written)) assert.ok(written.readUInt16LE(offset + 64) <= 64);
  const names = CFB.read(written, {type: 'buffer'}).FileIndex.map((entry) => entry.name);
  assert.ok(names.includes('N'.repeat(31)));

  const original = Upstream.read(Buffer.from(quietly(() => Upstream.write(container, {type: 'buffer'}))), {type: 'buffer'});
  assert.ok(original.FileIndex.some((entry) => entry.name === 'N'.repeat(32) + 'B'), 'cfb@1.2.2 reads its own length field back');
});

test('string content is written to ZIP archives', () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, 's.txt', 'plain string content');
  const back = CFB.read(CFB.write(container, {type: 'buffer', fileType: 'zip'}), {type: 'buffer'});
  assert.equal(Buffer.from(CFB.find(back, 's.txt').content).toString(), 'plain string content');
});

test('noseed writes compound files without the seed stream (js-cfb#22)', () => {
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, '/storage/small', Buffer.from('small'));
  CFB.utils.cfb_add(container, '/large', Buffer.alloc(5000, 7));
  const plain = CFB.read(CFB.write(container, {type: 'buffer'}), {type: 'buffer'});
  assert.ok(plain.FullPaths.some((fullPath) => fullPath.endsWith('\u0001Sh33tJ5')));

  const written = CFB.write(container, {type: 'buffer', noseed: true});
  const parsed = CFB.read(written, {type: 'buffer'});
  assert.ok(!parsed.FullPaths.some((fullPath) => fullPath.endsWith('\u0001Sh33tJ5')));
  assert.equal(Buffer.from(CFB.find(parsed, '/storage/small').content).toString(), 'small');
  assert.deepEqual(Buffer.from(CFB.find(parsed, '/large').content), Buffer.alloc(5000, 7));

  /* unused directory slots read back as type 0 entries, as in cfb@1.2.2 */
  const empty = CFB.read(CFB.write(CFB.utils.cfb_new(), {type: 'buffer', noseed: true}), {type: 'buffer'});
  assert.deepEqual(empty.FullPaths.filter((fullPath, index) => empty.FileIndex[index].type !== 0), ['Root Entry/']);
});

test('ZIP archives written by other tools: ZIP64 and data descriptors', () => {
  const digests = {
    'stored-descriptor.zip': '1c907af7cc8945775ed62c7afc97b28878c13040220ed9b6f1c8143747c3377f',
    'zip64-descriptor.zip': 'c32d0c35d1c43b2a8ead7d38d990ce1536c4e2a950f25bc417dea11ad9d8b667',
    'zip64-local.zip': 'de0426898c846d5a8de3233d212508ffa68438e7c1319ab9572de1ed7406aaa9'
  };
  const expected = {
    'stored-descriptor.zip': {'stored.txt': 'stored with descriptor', 'streamed.txt': 'streamed stored entry'},
    'zip64-descriptor.zip': {'streamed.txt': 'zip64 streamed '.repeat(50)},
    'zip64-local.zip': {'data.txt': 'hello zip64 '.repeat(100), 'plain.txt': 'plain entry'}
  };
  for (const [name, digest] of Object.entries(digests)) {
    const bytes = fixture(name);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), digest, name);
    assert.deepEqual(contents(CFB.read(bytes, {type: 'buffer'})), expected[name], name);
    assert.throws(() => Upstream.read(bytes, {type: 'buffer'}), undefined, `cfb@1.2.2 cannot read ${name}`);
  }
});

test('ZIP64 central directory fields and end records', () => {
  const entries = [['one.txt', Buffer.from('first')], ['two.txt', Buffer.from('second entry')]];
  const expected = {'one.txt': 'first', 'two.txt': 'second entry'};
  for (const options of [{}, {centralZip64: true}, {endZip64: true}, {centralZip64: true, endZip64: true}]) {
    const zip = buildZip(entries, options);
    assert.deepEqual(contents(CFB.read(zip, {type: 'buffer'})), expected, JSON.stringify(options));
  }
  const plain = buildZip(entries);
  assert.deepEqual(contents(CFB.read(plain, {type: 'buffer'})), contents(Upstream.read(plain, {type: 'buffer'})));
});
