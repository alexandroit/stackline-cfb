function seed_cfb(cfb/*:CFBContainer*/)/*:void*/ {
	var nm = "\u0001Sh33tJ5";
	if(CFB.find(cfb, "/" + nm)) return;
	var p = new_buf(4); p[0] = 55; p[1] = p[3] = 50; p[2] = 54;
	cfb.FileIndex.push(({ name: nm, type: 2, content:p, size:4, L:69, R:69, C:69 }/*:any*/));
	cfb.FullPaths.push(cfb.FullPaths[0] + nm);
	rebuild_cfb(cfb);
}

/* Remove the seed stream after a rebuild, for writers that must not add any
   stream (js-cfb#22); the remaining entries stay sorted, so relink in place. */
function unseed_cfb(cfb/*:CFBContainer*/)/*:void*/ {
	var path = cfb.FullPaths[0] + "\u0001Sh33tJ5";
	for(var i = 1; i < cfb.FullPaths.length; ++i) if(cfb.FullPaths[i] === path) {
		cfb.FullPaths.splice(i, 1);
		cfb.FileIndex.splice(i, 1);
		link_cfb(cfb);
		return;
	}
}
