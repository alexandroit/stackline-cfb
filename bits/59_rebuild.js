}

/* Directory links for entries already sorted by namecmp: each storage points
   at its first child (C) and siblings are chained in order through R. */
function link_cfb(cfb/*:CFBContainer*/)/*:void*/ {
	var i = 0, j = 0, n = cfb.FullPaths.length;
	for(i = 0; i < n; ++i) {
		var elt = cfb.FileIndex[i];
		var nm = cfb.FullPaths[i];

		elt.name =  filename(nm).replace("/","");
		elt.L = elt.R = elt.C = -(elt.color = 1);
		elt.size = elt.content ? elt.content.length : 0;
		elt.start = 0;
		elt.clsid = (elt.clsid || HEADER_CLSID);
		if(i === 0) {
			elt.C = n > 1 ? 1 : -1;
			elt.size = 0;
			elt.type = 5;
		} else if(nm.slice(-1) == "/") {
			for(j=i+1;j < n; ++j) if(dirname(cfb.FullPaths[j])==nm) break;
			elt.C = j >= n ? -1 : j;
			for(j=i+1;j < n; ++j) if(dirname(cfb.FullPaths[j])==dirname(nm)) break;
			elt.R = j >= n ? -1 : j;
			elt.type = 1;
		} else {
			if(dirname(cfb.FullPaths[i+1]||"") == dirname(nm)) elt.R = i + 1;
			elt.type = 2;
		}
	}
}

