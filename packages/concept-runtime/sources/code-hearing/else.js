async (args, bindings, api) => {
  // "else", "catch", "finally" go on from what was said just before them: they belong to the
  // statement before, and take what follows them as any leading word does ("else if ...").
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value;
  // Each field is a List, one entry a word.
  const v = (k, i) => api.lists.at(field[k], i);
  const is = (i, k) => i >= 0 && i < api.lists.size(field.kinds) && v("kinds", i).args.some((a) => a.value === k);
  const out = [];
  let p = at - 1;
  while (p >= 0 && is(p, "Separator")) p--;
  let r = p;
  while (r >= 0 && v("parent", r) >= 0) r = v("parent", r);
  // Once that statement is one thing, led by a word that leads (not yet by something that
  // itself goes on from before, which will find its own place first).
  if (r >= 0 && is(r, "Prefix") && !is(r, "Continues")) out.push(api.call("Link", at, r, api.call("Takes")));
  const leads = await api.evaluate({ head: "Prefix", args: self.args }, api.context);
  return api.call("List", ...out, ...(leads && leads.head === "List" ? leads.args.map((a) => a.value) : []));
}
