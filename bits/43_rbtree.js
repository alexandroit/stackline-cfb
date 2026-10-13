/* [MS-CFB] 2.6.4 Red-Black Tree */
/* Parent of every entry reachable from the root: the members of each child
   tree (C, then L/R) belong to the storage that points at that tree.
   Unreachable entries keep -1, and each entry is visited once. */
function tree_parents(FI/*:CFBFileIndex*/, pl/*:number*/)/*:Array<number>*/ {
	var parent/*:Array<number>*/ = [], seen/*:Array<boolean>*/ = [], stack/*:Array<number>*/ = [];
	var i = 0, n = 0, p = 0;
	for(i = 0; i < pl; ++i) parent[i] = -1;
	if(pl > 0 && FI[0]) { seen[0] = true; stack.push(FI[0].C, 0); }
	while(stack.length > 0) {
		p = stack.pop(); n = stack.pop();
		if(n < 0 || n >= pl || seen[n] || !FI[n]) continue;
		seen[n] = true;
		parent[n] = p;
		stack.push(FI[n].L, p, FI[n].R, p, FI[n].C, n);
	}
	return parent;
}

function build_full_paths(FI/*:CFBFileIndex*/, FP/*:Array<string>*/, Paths/*:Array<string>*/)/*:void*/ {
	var i = 0, L = 0, R = 0, C = 0, j = 0, pl = Paths.length;
	var dad/*:Array<number>*/ = [], q/*:Array<number>*/ = [], walk/*:Array<number>*/ = [];

	for(; i < pl; ++i) { dad[i]=q[i]=i; FP[i]=Paths[i]; }

	for(; j < q.length; ++j) {
		i = q[j];
		L = FI[i].L; R = FI[i].R; C = FI[i].C;
		if(dad[i] === i) {
			if(L !== -1 /*NOSTREAM*/ && dad[L] !== L) dad[i] = dad[L];
			if(R !== -1 && dad[R] !== R) dad[i] = dad[R];
		}
		if(C !== -1 /*NOSTREAM*/) dad[C] = i;
		if(L !== -1 && i != dad[i]) { dad[L] = dad[i]; if(q.lastIndexOf(L) < j) q.push(L); }
		if(R !== -1 && i != dad[i]) { dad[R] = dad[i]; if(q.lastIndexOf(R) < j) q.push(R); }
	}
	for(i=1; i < pl; ++i) if(dad[i] === i) {
		if(R !== -1 /*NOSTREAM*/ && dad[R] !== R) dad[i] = dad[R];
		else if(L !== -1 && dad[L] !== L) dad[i] = dad[L];
	}

	/* An entry listed before its parent storage inside a sibling subtree is
	   left without a parent above (js-cfb#15); take its parent from the tree. */
	var tree = tree_parents(FI, pl);
	for(i=1; i < pl; ++i) if(dad[i] === i && tree[i] >= 0) dad[i] = tree[i];

	for(i=1; i < pl; ++i) {
		if(FI[i].type === 0 /* unknown */) continue;
		j = i;
		walk[i] = i;
		if(j != dad[j]) do {
			j = dad[j];
			/* a cycle of parent links never ends and doubles the path on each pass */
			if(walk[j] === i) throw new Error("Directory tree cycle at entry " + i);
			walk[j] = i;
			FP[i] = FP[j] + "/" + FP[i];
		} while (j !== 0 && -1 !== dad[j] && j != dad[j]);
		dad[i] = -1;
	}

	FP[0] += "/";
	for(i=1; i < pl; ++i) {
		if(FI[i].type !== 2 /* stream */) FP[i] += "/";
	}
}

