async (args, bindings, api) => {
  // "a + b": an operator takes the thing before it and the thing after it, once neither is
  // held more tightly by the operator on its other side. With nothing before it, it holds
  // only what follows ("-x"), as tightly as any word alone before a thing does (or as its own
  // Binds says, for a word that also leads, like "not"); with nothing after it, only what is
  // before it ("x++").
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  const v = (k, i) => (i >= 0 && i < field[k].length ? field[k][i].value : undefined);
  if (v("stray", at)) return api.call("List");
  const ALONE = 150;
  const alone = (i) => (v("prefix", i) ? v("binds", i) ?? ALONE : ALONE);
  const unary = v("unary", at);
  const postfix = v("postfix", at);
  const mine = unary ? alone(at) : postfix ? ALONE + 10 : v("binds", at) ?? 0;
  const rightToLeft = v("right", at);
  const holding = (b) => (v("unary", b) ? alone(b) : v("binds", b));
  const out = [];
  // What follows: the whole thing that starts after me, once what comes after it is not held
  // more tightly by the next operator, and nothing still belongs to it.
  let r = at + 1;
  if (!postfix && v("operandStart", r)) {
    while (v("parent", r) >= 0 && v("lo", v("parent", r)) > at) r = v("parent", r);
    const e = v("hi", r) + 1;
    // Its own closing bracket, not yet absorbed, is not where it ends.
    if (v("punctuation", e) && v("pair", e) >= r && v("pair", e) < e) return api.call("List", ...out);
    const next = v("operator", e) && !v("unary", e) ? holding(e) : undefined;
    const free = v("parent", r) < 0 && !v("punctuation", r);
    if (free && (v("boundary", e) || (next !== undefined && next !== null && (next < mine || (next === mine && !rightToLeft))))) out.push(api.call("Link", r, at, api.call("Takes")));
  }
  if (unary) return api.call("List", ...out);
  // What comes before: the whole thing that ends before me, once the operator before it (if
  // any) does not hold it more tightly.
  let l = at - 1;
  while (l >= 0 && v("parent", l) >= 0 && v("hi", v("parent", l)) < at) l = v("parent", l);
  if (l >= 0 && v("operandEnd", at - 1) && v("parent", l) < 0 && !v("punctuation", l)) {
    const b = v("lo", l) - 1;
    const before = b >= 0 && (v("infix", b) || v("prefix", b)) ? holding(b) : undefined;
    if (before === undefined || before === null || before < mine || (before === mine && rightToLeft)) out.push(api.call("Link", l, at, api.call("Takes")));
  }
  return api.call("List", ...out);
}
