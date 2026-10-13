function read_file(filename/*:string*/, options/*:CFBReadOpts*/) {
	get_fs();
	return parse(fs.readFileSync(filename), options);
}

function read(blob/*:RawBytes|string*/, options/*:CFBReadOpts*/) {
	/* js-cfb#20: a parsed container is not file data */
	if(blob && typeof blob == "object" && (/*::(*/blob/*:: :any)*/).FileIndex && (/*::(*/blob/*:: :any)*/).FullPaths) throw new TypeError("CFB.read expects file data, not a parsed container; use CFB.find to get an entry");
	var type = options && options.type;
	if(!type) {
		if(has_buf && Buffer.isBuffer(blob)) type = "buffer";
	}
	switch(type || "base64") {
		case "file": /*:: if(typeof blob !== 'string') throw "Must pass a filename when type='file'"; */return read_file(blob, options);
		case "base64": /*:: if(typeof blob !== 'string') throw "Must pass a base64-encoded binary string when type='file'"; */return parse(s2a(Base64_decode(blob)), options);
		case "binary": /*:: if(typeof blob !== 'string') throw "Must pass a binary string when type='file'"; */return parse(s2a(blob), options);
	}
	return parse(/*::typeof blob == 'string' ? new Buffer(blob, 'utf-8') : */blob, options);
}

