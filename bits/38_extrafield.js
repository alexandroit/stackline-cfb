/* unsigned 64-bit little-endian value (exact below 2^53) */
function read_uint64(blob/*:CFBlob*/)/*:number*/ {
	var lo = blob.read_shift(4) >>> 0, hi = blob.read_shift(4) >>> 0;
	return hi * 4294967296 + lo;
}

function parse_extra_field(blob/*:CFBlob*/)/*:any*/ {
	prep_blob(blob, 0);
	var o = /*::(*/{}/*:: :any)*/;
	var flags = 0;
	while(blob.l <= blob.length - 4) {
		var type = blob.read_shift(2);
		var sz = blob.read_shift(2), tgt = blob.l + sz;
		var p = {};
		switch(type) {
			/* UNIX-style Timestamps */
			case 0x5455: {
				flags = blob.read_shift(1);
				if(flags & 1) p.mtime = blob.read_shift(4);
				/* for some reason, CD flag corresponds to LFH */
				if(sz > 5) {
					if(flags & 2) p.atime = blob.read_shift(4);
					if(flags & 4) p.ctime = blob.read_shift(4);
				}
				if(p.mtime) p.mt = new Date(p.mtime*1000);
			}
			break;
			/* ZIP64 Extended Information: 8-byte values for the 32-bit header
			   fields that hold 0xFFFFFFFF, in header order (APPNOTE 4.5.3) */
			case 0x0001: {
				p.values = [];
				while(blob.l + 8 <= tgt) p.values.push(read_uint64(blob));
			}
			break;
		}
		blob.l = tgt;
		o[type] = p;
	}
	return o;
}
