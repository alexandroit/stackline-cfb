/* ES3/ES5 smoke test for every Node.js release in "engines" (0.8 and newer).
   Run with: node test/legacy-smoke.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var CFB = require('../cfb.js');

/* Buffer.from is missing or inherited from Uint8Array before Node.js 4.5. */
var toBuffer = typeof Buffer.alloc === 'function'
	? function(data) { return Buffer.from(data); }
	: function(data) { return new Buffer(data); };

function bytes(content) {
	var out = [];
	for (var i = 0; i < content.length; ++i) out.push(content[i]);
	return out.join(',');
}

function same(left, right, label) {
	assert.equal(bytes(left), bytes(right), label);
}

var checked = 0;
var names = ['AutoFilter.xls', 'custom_properties.xls', 'custom_properties.xlsx'];
for (var n = 0; n < names.length; ++n) {
	var input = fs.readFileSync(path.join(__dirname, '..', 'test_files', names[n]));
	var parsed = CFB.read(input, {type: 'buffer'});
	assert.ok(parsed.FullPaths.length > 1, names[n]);
	var outputs = [{type: 'buffer'}, {type: 'buffer', fileType: 'zip'}, {type: 'buffer', fileType: 'zip', compression: true}];
	for (var o = 0; o < outputs.length; ++o) {
		var again = CFB.read(CFB.write(CFB.read(input, {type: 'buffer'}), outputs[o]), {type: 'buffer'});
		for (var i = 0; i < parsed.FileIndex.length; ++i) {
			var entry = parsed.FileIndex[i];
			if (entry.type !== 2 || !entry.content || entry.name === '\u0001Sh33tJ5') continue;
			var relative = '/' + parsed.FullPaths[i].slice(parsed.FullPaths[0].length);
			var found = CFB.find(again, relative);
			assert.ok(found, names[n] + ' ' + relative);
			same(found.content, entry.content, names[n] + ' ' + parsed.FullPaths[i]);
			++checked;
		}
	}
}

var container = CFB.utils.cfb_new();
CFB.utils.cfb_add(container, '/folder/small', toBuffer('small'));
CFB.utils.cfb_add(container, 'plain.txt', 'string content');
var zip = CFB.read(CFB.write(container, {type: 'buffer', fileType: 'zip'}), {type: 'buffer'});
assert.equal(toBuffer(CFB.find(zip, 'plain.txt').content).toString(), 'string content');
var noseed = CFB.read(CFB.write(container, {type: 'buffer', noseed: true}), {type: 'buffer'});
for (var p = 0; p < noseed.FullPaths.length; ++p) assert.ok(noseed.FullPaths[p].indexOf('\u0001Sh33tJ5') === -1);
assert.equal(toBuffer(CFB.find(noseed, '/folder/small').content).toString(), 'small');

var truncated = toBuffer([0]);
truncated.l = 0;
assert.throws(function() { CFB.utils._inflateRaw(truncated); }, /Unexpected end of DEFLATE stream/);

/* "short" deflated, inflated into a larger declared size: the rest is zero */
var shortStream = toBuffer([0x2b, 0xce, 0xc8, 0x2f, 0x2a, 0x01, 0x00]);
shortStream.l = 0;
var padded = CFB.utils._inflateRaw(shortStream, 4096);
assert.equal(padded.length, 4096);
assert.equal(toBuffer(padded).slice(0, 5).toString(), 'short');
for (var z = 5; z < padded.length; ++z) assert.equal(padded[z], 0, 'byte ' + z);

console.log('legacy smoke passed on ' + process.version + ' (' + checked + ' streams compared)');
