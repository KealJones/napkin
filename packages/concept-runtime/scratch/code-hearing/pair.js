async (args, bindings, api) => {
  // A bracket finds what closes it (Closes). (Its hearing, once it has, is opener.js.)
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
  if (v("pair", at) >= 0) return api.call("List");
  {
    // Its closer: the next closing bracket where the brackets between have all closed. A
    // bracket that says it is closed by something other than a bracket ("?" by ":") is
    // left to find its own.
    const plain = (i) => {
      const c = claim(head(i), "ClosedBy");
      if (!c) return true;
      const to = api.store.get(c.args[0].value.head);
      return !!to && to.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "Closer");
    };
    if (!plain(at)) return api.call("List");
    let depth = 0;
    for (let k = at + 1; k < n; k++) {
      const p = v("pair", k);
      if (p > k) {
        k = p;
        continue;
      }
      if (p >= 0) continue;
      if (is(k, "Opener") && plain(k)) depth++;
      else if (is(k, "Closer")) {
        if (depth === 0) return api.call("List", api.call("Link", k, at, api.call("Closes")));
        depth--;
      }
    }
    return api.call("List");
  }
  return api.call("List");
}
