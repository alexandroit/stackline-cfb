function warn_or_throw(wrn, msg) {
	if(wrn) { if(typeof console !== 'undefined') console.error(msg); }
	else throw new Error(msg);
}

function parse_zip(file/*:RawBytes*/, options/*:CFBReadOpts*/)/*:CFBContainer*/ {
	var blob/*:CFBlob*/ = /*::(*/file/*:: :any)*/;
	prep_blob(blob, 0);

	var FileIndex/*:CFBFileIndex*/ = [], FullPaths/*:Array<string>*/ = [];
	var o = {
		FileIndex: FileIndex,
		FullPaths: FullPaths
	};
	init_cfb(o, { root: options.root });

	/* find end of central directory, start just after signature */
	var i = blob.length - 4;
	while((blob[i] != 0x50 || blob[i+1] != 0x4b || blob[i+2] != 0x05 || blob[i+3] != 0x06) && i >= 0) --i;
	blob.l = i + 4;

	/* parse end of central directory */
	blob.l += 4;
	var fcnt = blob.read_shift(2);
	blob.l += 6;
	var start_cd = blob.read_shift(4);

	/* ZIP64 end of central directory, located by the record just before */
	if((fcnt === 0xFFFF || (start_cd >>> 0) === 0xFFFFFFFF) && i >= 20 && __readInt32LE(blob, i - 20) === 0x07064b50) {
		blob.l = i - 12;
		var eocd64 = read_uint64(blob);
		if(eocd64 + 56 <= blob.length && __readInt32LE(blob, eocd64) === 0x06064b50) {
			blob.l = eocd64 + 24;
			fcnt = read_uint64(blob);
			blob.l += 16;
			start_cd = read_uint64(blob);
		}
	}

	/* parse central directory */
	blob.l = start_cd;

	for(i = 0; i < fcnt; ++i) {
		/* trust local file header instead of CD entry */
		blob.l += 20;
		var csz = blob.read_shift(4);
		var usz = blob.read_shift(4);
		var namelen = blob.read_shift(2);
		var efsz = blob.read_shift(2);
		var fcsz = blob.read_shift(2);
		blob.l += 8;
		var offset = blob.read_shift(4);
		var EF = parse_extra_field(/*::(*/blob.slice(blob.l+namelen, blob.l+namelen+efsz)/*:: :any)*/);
		blob.l += namelen + efsz + fcsz;

		/* ZIP64: only the fields set to 0xFFFFFFFF follow, in this order */
		var z64 = (EF[0x0001]||{}).values;
		if(z64) {
			var zi = 0;
			if((usz >>> 0) === 0xFFFFFFFF && zi < z64.length) usz = z64[zi++];
			if((csz >>> 0) === 0xFFFFFFFF && zi < z64.length) csz = z64[zi++];
			if((offset >>> 0) === 0xFFFFFFFF && zi < z64.length) offset = z64[zi++];
		}

		var L = blob.l;
		blob.l = offset + 4;
		parse_local_file(blob, csz, usz, o, EF);
		blob.l = L;
	}

	return o;
}


/* head starts just after local file header signature */
function parse_local_file(blob/*:CFBlob*/, csz/*:number*/, usz/*:number*/, o/*:CFBContainer*/, EF) {
	/* [local file header] */
	blob.l += 2;
	var flags = blob.read_shift(2);
	var meth = blob.read_shift(2);
	var date = parse_dos_date(blob);

	if(flags & 0x2041) throw new Error("Unsupported ZIP encryption");
	var crc32 = blob.read_shift(4);
	var _csz = blob.read_shift(4);
	var _usz = blob.read_shift(4);

	var namelen = blob.read_shift(2);
	var efsz = blob.read_shift(2);

	// TODO: flags & (1<<11) // UTF8
	var name = ""; for(var i = 0; i < namelen; ++i) name += String.fromCharCode(blob[blob.l++]);
	var zip64 = false;
	if(efsz) {
		var ef = parse_extra_field(/*::(*/blob.slice(blob.l, blob.l + efsz)/*:: :any)*/);
		if((ef[0x5455]||{}).mt) date = ef[0x5455].mt;
		if(((EF||{})[0x5455]||{}).mt) date = EF[0x5455].mt;
		/* ZIP64 local headers carry both sizes when either is 0xFFFFFFFF */
		var z64 = (ef[0x0001]||{}).values;
		if(z64 && ((_usz >>> 0) === 0xFFFFFFFF || (_csz >>> 0) === 0xFFFFFFFF)) {
			zip64 = true;
			var zi = 0;
			if(z64.length >= 2 || (_usz >>> 0) === 0xFFFFFFFF) _usz = z64[zi++];
			if(zi < z64.length) _csz = z64[zi++];
		}
	}
	blob.l += efsz;

	/* [encryption header] */

	/* [file data] */
	/* streamed stored entries leave the local sizes at zero and append a data
	   descriptor; the central directory size is the only way to find the end */
	if(meth == 0 && (flags & 8) && !_csz && csz > 0) _csz = csz;
	var data = blob.slice(blob.l, blob.l + _csz);
	switch(meth) {
		case 8: data = _inflateRawSync(blob, _usz); break;
		case 0: blob.l += _csz; break; // TODO: scan for magic number
		default: throw new Error("Unsupported ZIP Compression method " + meth);
	}

	/* [data descriptor] */
	var wrn = false;
	if(flags & 8) {
		crc32 = blob.read_shift(4);
		if(crc32 == 0x08074b50) { crc32 = blob.read_shift(4); wrn = true; }
		if(zip64) {
			_csz = read_uint64(blob);
			_usz = read_uint64(blob);
		} else {
			_csz = blob.read_shift(4);
			_usz = blob.read_shift(4);
		}
	}

	if(_csz != csz) warn_or_throw(wrn, "Bad compressed size: " + csz + " != " + _csz);
	if(_usz != usz) warn_or_throw(wrn, "Bad uncompressed size: " + usz + " != " + _usz);
	var _crc32 = CRC32.buf(data, 0);
	if((crc32>>0) != (_crc32>>0)) warn_or_throw(wrn, "Bad CRC32 checksum: " + crc32 + " != " + _crc32);
	cfb_add(o, name, data, {unsafe: true, mt: date});
}
