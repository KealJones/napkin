async (args, bindings, api) => {
  // A bracket groups what it holds, and where it stands says whose the group is:
  // - after a name, round brackets are what the name takes ("print(x)"): its arguments;
  //   empty, they stay said ("print()" is Print(Parens()));
  // - after a word that heads a statement ("if (...)", "for (...)"), they are its header;
  // - a block belongs to the word that leads what is said before it ("for ... { }", "if
  //   ...:"), its statements that word's; a block a name leads is the name's Block ("m() { }");
  // - angles belong to the name before them; an index takes the thing before it too;
  // - a template takes each piece inside it, an interpolation is its one thing;
  // - any other group is itself a word (Brackets(1, 2), Braces(...), Parens(a, b)), except
  //   round brackets around one thing, which are only how the thing is said.
  // The closing bracket and the separators are part of how it is said: absorbed.
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  // An entry that changes as links are made is a cell: read what it holds now.
  const v = (k, i) => {
    if (!(i >= 0 && i < field[k].length)) return undefined;
    const x = field[k][i].value;
    return x !== null && typeof x === "object" && x.head === "CellRef" ? api.cells.read(x) : x;
  };
  const is = (i, k) => i >= 0 && i < field.kinds.length && v("kinds", i).args.some((a) => a.value === k);
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const n = field.kinds.length;
  const head = (i) => v("heads", i);
  const claim = (h, k) => {
    const unit = h ? api.store.get(h) : undefined;
    const r = unit ? unit.relations.find((x) => isCall(x.claim) && x.claim.head === k) : undefined;
    return r ? r.claim : undefined;
  };
  const close = v("pair", at);
  if (close < 0) return api.call("List");
  // The parts: between separators; a comment is a part of its own; in a template, each piece.
  // A separator that introduces a block (Python's ":") is inside a part, not between two.
  const each = is(at, "Juxtaposed");
  const parts = [];
  const separators = [];
  let a = at + 1;
  for (let k = at + 1; k < close; k++) {
    if (v("inside", k) !== at) continue;
    if (each) {
      parts.push([k, v("pair", k) > k ? v("pair", k) + 1 : k + 1]);
    } else if (is(k, "Comment")) {
      if (k > a) parts.push([a, k]);
      parts.push([k, k + 1]);
      a = k + 1;
    } else if (v("pair", k) > k && v("scope", k) && !v("alone", k) && v("operandStart", v("pair", k) + 1) && !is(v("pair", k) + 1, "Continues") && v("pair", k) + 1 < close) {
      // A block ends what is said: what starts after it is another part.
      parts.push([a, v("pair", k) + 1]);
      a = v("pair", k) + 1;
    } else if (is(k, "Separator") && !v("scope", k + 1) && !is(k + 1, "Continues")) {
      if (k > a) parts.push([a, k]);
      separators.push(k);
      a = k + 1;
    }
    if (v("pair", k) > k) k = v("pair", k) - 1;
  }
  if (!each && close > a) parts.push([a, close]);
  const tops = parts.map(([x, y]) => {
    const found = new Set();
    for (let k = x; k < y; k++) {
      if (is(k, "Separator") && v("parent", k) < 0) continue;
      let t = k;
      while (v("parent", t) >= x && v("parent", t) < y) t = v("parent", t);
      found.add(t);
      if (found.size > 1) break;
    }
    return [...found];
  });
  const settled = tops.every((t) => t.length === 1);
  const out = [];
  const link = (from, to, role) => {
    if (from >= 0 && v("parent", from) < 0) out.push(api.call("Link", from, to, api.call(role)));
  };
  // Its parts are the owner's: the brackets are only how they are said.
  const into = (owner) => {
    link(at, owner, "Absorbs");
    link(close, owner, "Absorbs");
    for (const s of separators) link(s, owner, "Absorbs");
    if (settled) for (const t of tops) link(t[0], owner, "Takes");
  };
  // It is a word of its own, holding its parts.
  const word = () => {
    link(close, at, "Absorbs");
    for (const s of separators) link(s, at, "Absorbs");
    if (settled) for (const t of tops) link(t[0], at, "Takes");
  };
  const transparent = () => {
    if (tops.length === 1 && settled) {
      link(at, tops[0][0], "Absorbs");
      link(close, tops[0][0], "Absorbs");
    }
  };
  if (v("scope", at)) {
    // Who the block belongs to: the name whose brackets come just before it (a function, a
    // method; with its return type, that type's colon), else the word that leads what is said
    // before it (if, for, class, else). After an operator it belongs to no one: it is the
    // operator's thing ("=> { }").
    const stops = (k) => is(k, "Separator") || v("scope", k) || is(k, "Comment") || (is(k, "Closer") && v("scope", v("pair", k)));
    const back = (j) => (is(j, "Closer") && v("pair", j) >= 0 ? v("pair", j) - 1 : j - 1);
    const leader = () => {
      let p = at - 1;
      if (is(p, "Separator") && head(at) !== "Block") p--;
      if (p < 0 || v("infix", p)) return -1;
      let k = p;
      let typed = -1;
      if (!(is(k, "Closer") && head(v("pair", k)) === "Parens")) {
        for (let j = k; j >= 0 && !stops(j); j = back(j)) {
          if (is(j, "Opener")) break;
          if (head(j) === "Returns") {
            typed = j;
            k = j - 1;
            break;
          }
        }
      }
      if (is(k, "Closer") && head(v("pair", k)) === "Parens") {
        let g = v("pair", k) - 1;
        if (is(g, "Closer") && head(v("pair", g)) === "Angles") g = v("pair", g) - 1;
        if (is(g, "Name") && !v("infix", g)) return v("prefix", g) ? g : typed >= 0 ? typed : g;
      }
      for (let j = p; j >= 0 && !stops(j); j = back(j)) {
        if (is(j, "Opener")) break;
        if (v("prefix", j)) return j;
      }
      return -1;
    };
    const owner = leader();
    if (owner >= 0 && is(owner, "Prefix")) into(owner);
    else {
      word();
      if (owner >= 0) link(at, owner, "Takes");
    }
  } else if (is(at, "Transparent")) {
    transparent();
  } else if (each) {
    word();
  } else if (is(at, "Attached")) {
    word();
    if (is(at - 1, "Name")) link(at, at - 1, "Takes");
  } else if (is(at, "Postfix")) {
    // The thing before it, as an operator after a thing takes it: "a.b[0]" indexes a.b.
    word();
    let l = at - 1;
    while (l >= 0 && v("parent", l) >= 0 && v("hi", v("parent", l)) < at) l = v("parent", l);
    const b = l >= 0 ? v("lo", l) - 1 : -1;
    if (v("operandEnd", b)) return api.call("List", ...out);
    const before = b >= 0 && !(v("pair", b) > at) && (v("operator", b) || v("prefix", b)) ? (v("unary", b) ? 150 : v("binds", b)) : null;
    if (l >= 0 && v("parent", l) < 0 && !v("punctuation", l) && (before === null || before < (v("binds", at) ?? 200))) link(l, at, "Takes");
  } else {
    let p = at - 1;
    if (is(p, "Closer") && is(v("pair", p), "Attached")) p = v("pair", p) - 1;
    const round = is(at, "Round");
    const named = round && is(p, "Name") && !v("infix", p);
    if (named && is(p, "Callable")) {
      // A leading word that can also be called ("import(...)"): its brackets are said.
      word();
      link(at, p, "Takes");
    } else if (named && is(p, "Heads")) {
      if (parts.length === 1) into(p);
      else {
        word();
        link(at, p, "Takes");
      }
    } else if (named && !v("prefix", p)) {
      if (parts.length) into(p);
      else {
        link(at, p, "Takes");
        link(close, at, "Absorbs");
      }
    } else if (round && parts.length === 1) {
      transparent();
    } else {
      word();
    }
  }
  return api.call("List", ...out);
}
