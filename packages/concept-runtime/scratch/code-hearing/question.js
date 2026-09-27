async (args, bindings, api) => {
  // "a ? b : c": the question takes what is asked before it, and holds what is between it and
  // its ":" and what follows the ":" as the two answers.
  const self = bindings.get("word");
  const at = self.args[1].value;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  const v = (k, i) => (i >= 0 && i < field[k].length ? field[k][i].value : undefined);
  const close = v("pair", at);
  if (close < 0) return api.call("List");
  const mine = v("binds", at) ?? 25;
  const holding = (b) => (v("unary", b) ? 150 : v("binds", b));
  const out = [];
  const link = (from, role) => {
    if (from >= 0 && v("parent", from) < 0) out.push(api.call("Link", from, at, api.call(role)));
  };
  link(close, "Absorbs");
  // What is asked: the thing before, unless the operator before it holds it more tightly.
  let l = at - 1;
  while (l >= 0 && v("parent", l) >= 0 && v("hi", v("parent", l)) < at) l = v("parent", l);
  if (l >= 0 && v("parent", l) < 0 && !v("punctuation", l)) {
    const b = v("lo", l) - 1;
    const before = b >= 0 && (v("infix", b) || v("prefix", b)) ? holding(b) : null;
    if (before === null || before <= mine) link(l, "Takes");
  }
  // The first answer: the one thing between.
  let m = at + 1;
  while (v("parent", m) >= 0 && v("parent", m) > at && v("parent", m) < close) m = v("parent", m);
  if (v("lo", m) === at + 1 && v("hi", m) === close - 1) link(m, "Takes");
  // The second: the whole thing after the ":".
  let r = close + 1;
  if (v("operandStart", r)) {
    while (v("parent", r) >= 0 && v("lo", v("parent", r)) > close) r = v("parent", r);
    const e = v("hi", r) + 1;
    const next = v("operator", e) && !v("unary", e) ? holding(e) : undefined;
    if (v("boundary", e) || (next !== undefined && next !== null && next < mine)) link(r, "Takes");
  }
  return api.call("List", ...out);
}
