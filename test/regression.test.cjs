const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const CFB = require('../cfb.js');
function cyclicStream() {
  const file = CFB.utils.cfb_new();
  CFB.utils.cfb_add(file, 'large', Buffer.alloc(8192, 65));
  const data = CFB.write(file, {type:'buffer'});
  const size = 1 << data.readUInt16LE(30);
  const directory = data.readInt32LE(48), fat = data.readInt32LE(76);
  let entry = -1;
  for (let offset = (directory + 1) * size; offset < (directory + 2) * size; offset += 128) {
    if (data.toString('utf16le', offset, offset + data.readUInt16LE(offset + 64) - 2) === 'large') entry = offset;
  }
  assert.notEqual(entry, -1);
  const first = data.readInt32LE(entry + 116);
  const second = data.readInt32LE((fat + 1) * size + first * 4);
  data.writeInt32LE(second, entry + 116);
  data.writeInt32LE(second, (fat + 1) * size + second * 4);
  return data;
}
test('a corrupt FAT chain fails without hanging (upstream #11)', () => {
  const script = `const cfb=require(${JSON.stringify(require.resolve('../cfb.js'))});try {cfb.read(require('fs').readFileSync(0),{type:'buffer'});process.exitCode=1;}catch(error){if(!/Cycle detected in FAT chain/.test(error.message))throw error;}`;
  const child = spawnSync(process.execPath, ['-e', script], {input:cyclicStream(),timeout:3000,encoding:'utf8'});
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});
for (const [fileType, compression] of [['cfb',false],['zip',false],['zip',true]]) {
  test(`valid ${fileType} archive retains nested small and large streams (${compression})`, () => {
    const file = CFB.utils.cfb_new({root:'Example'});
    const contents = {'nested/small':Buffer.from('café 東京'),large:Buffer.alloc(8192, 73)};
    for(const [name, bytes] of Object.entries(contents)) CFB.utils.cfb_add(file, name, bytes);
    const data = CFB.write(file, {type:'buffer',fileType,compression});
    const parsed = CFB.read(data, {type:'buffer'});
    for(const [name, bytes] of Object.entries(contents)) assert.deepEqual(Buffer.from(CFB.find(parsed,'/' + name).content),bytes);
  });
}
test('minified browser bundle rejects the same cyclic archive', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/cfb.min.js'),'utf8'),context);
  context.input = Array.from(cyclicStream());
  assert.throws(() => vm.runInContext('CFB.read(new Uint8Array(input),{type:"buffer"})',context,{timeout:1000}), /Cycle detected in FAT chain/);
});
test('generated browser and CommonJS versions match the package', () => {
  assert.equal(CFB.version,require('../package.json').version);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/cfb.min.js'),'utf8'),context);
  assert.equal(context.CFB.version,CFB.version);
});
