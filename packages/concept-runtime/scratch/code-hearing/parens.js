async (args, bindings, api) => {
  // "(" right after a closed group that is not a header, a block or angles: what that group
  // gives, called ("f(x)(y)").
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const at = self.args[1].value;
  const words = api.cells.read(self.args[0].value).args;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  const v = (k, i) => (i >= 0 && i < field[k].length ? field[k][i].value : undefined);
  const n = field.kinds.length;
  const is = (i, k) => i >= 0 && i < n && v("kinds", i).args.some((a) => a.value === k);
  const text = (i) => (i >= 0 && i < n ? words[i].value.args[0].value : "");
  const head = (i) => v("heads", i);
  const pair = (i) => (v("pair", i) === undefined ? -1 : v("pair", i));
  // As the kind of word it also is: what it does when it is not the case here.
  const as = (kind) => api.evaluate({ head: kind, args: self.args }, api.context);
  const sense = (h) => api.call("List", api.call("Sense", at, api.call(h)));
  // A thing ends here: a name that is no operator, a value, a closed bracket.
  const ends = (i) =>
    (is(i, "Name") && !is(i, "Infix") && !is(i, "Prefix")) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Closer") && head(i) !== "Dedent" && head(i) !== null && !is(pair(i), "Infix"));
  // Round brackets that head a statement: "if (x)".
  const header = (i) => is(i, "Closer") && pair(i) > 0 && is(pair(i) - 1, "Heads");
  if (pair(at) < 0) return as("Opener");
  const p = at - 1;
  const applied = is(p, "Closer") && !header(p) && head(p) !== null && pair(p) >= 0 && !is(pair(p), "Scope") && !is(pair(p), "Attached");
  return applied ? sense("Apply") : api.call("List");
}