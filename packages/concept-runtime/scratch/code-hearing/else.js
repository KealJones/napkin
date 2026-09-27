async (args, bindings, api) => {
  // "else" goes on from the block before it: it belongs to the word that block belongs to.
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  const v = (k, i) => (i >= 0 && i < field[k].length ? field[k][i].value : undefined);
  const is = (i, k) => i >= 0 && i < field.kinds.length && v("kinds", i).args.some((a) => a.value === k);
  let p = at - 1;
  while (p >= 0 && is(p, "Separator")) p--;
  const opened = is(p, "Closer") ? v("pair", p) : -1;
  if (opened < 0 || !v("block", opened) || v("leader", opened) < 0) return api.call("List");
  return api.call("List", api.call("Link", at, v("leader", opened), api.call("Takes")));
}
