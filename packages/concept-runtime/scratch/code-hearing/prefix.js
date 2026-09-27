async (args, bindings, api) => {
  // "return a + b", "const x", "for x in xs": a word that leads takes the whole thing after it,
  // up to where an operator holding less tightly than it begins.
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  const v = (k, i) => (i >= 0 && i < field[k].length ? field[k][i].value : undefined);
  const mine = v("binds", at) ?? 0;
  let r = at + 1;
  if (!v("operandStart", r)) return api.call("List");
  while (v("parent", r) >= 0 && v("lo", v("parent", r)) > at) r = v("parent", r);
  if (v("parent", r) >= 0 || v("punctuation", r)) return api.call("List");
  const e = v("hi", r) + 1;
  const next = v("infix", e) && !v("unary", e) ? v("binds", e) : undefined;
  if (v("boundary", e) || (next !== undefined && next !== null && next <= mine)) return api.call("List", api.call("Link", r, at, api.call("Takes")));
  return api.call("List");
}
