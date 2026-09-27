async (args, bindings, api) => {
  // "return a + b", "const x", "for x in xs": a word that leads takes the whole thing after it,
  // up to where an operator holding less tightly than it begins. A word that heads a statement
  // with a bracketed header ("if (x) ...") takes, after the header, the statement it heads.
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
  const mine = v("binds", at) ?? 0;
  const take = (start, after) => {
    let r = start;
    if (!v("operandStart", r)) return [];
    while (v("parent", r) >= 0 && v("lo", v("parent", r)) > after) r = v("parent", r);
    if (v("parent", r) >= 0 || v("punctuation", r)) return [];
    const e = v("hi", r) + 1;
    // Its own closing bracket, not yet absorbed, is not where it ends.
    if (v("punctuation", e) && v("pair", e) >= v("lo", r) && v("pair", e) < e) return [];
    const next = v("operator", e) && !v("unary", e) ? (v("postfix", e) ? 160 : v("binds", e)) : undefined;
    return v("boundary", e) || (next !== undefined && next !== null && next <= mine) ? [api.call("Link", r, at, api.call("Takes"))] : [];
  };
  const out = take(at + 1, at);
  if (is(at, "Heads") && is(at + 1, "Round") && v("pair", at + 1) > at) out.push(...take(v("pair", at + 1) + 1, v("pair", at + 1)));
  return api.call("List", ...out);
}
