// @realization Examples($name, Rest($examples)), context = Execution(), evaluateArguments = false
// A function found from what it gives ("f(1) is 2, f(2) is 4"), the way Predict finds a sequence's
// rule: every two-place operation the graph can work out and the code writer can write is tried
// on the examples (under Hypothetical, so nothing is changed), simplest rule first: a constant, an
// argument, one operation with a constant or between arguments, then two operations. The constants
// come from the examples themselves. Derived(SourceCode(...)), or NoRule when nothing fits them all.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const name = bindings.get("name");
  const examples = args.slice(1).map((a) => a.value).filter((e) => isCall(e) && e.head === "Example" && isCall(e.args[0].value));
  // Fewer than two examples is not enough to find a rule from: it stays itself.
  if (typeof name !== "string" || examples.length < 2) return api.call("Examples", ...args.map((a) => a.value));
  const ins = examples.map((e) => e.args[0].value.args.map((a) => a.value));
  const outs = examples.map((e) => e.args[1].value);
  const arity = ins[0].length;
  if (!ins.every((i) => i.length === arity)) return api.call("Examples", ...args.map((a) => a.value));
  const names = arity === 1 ? ["x"] : ["a", "b", "c", "d", "e"].slice(0, arity);
  const same = (a, b) => api.format(a) === api.format(b);
  const ctx = api.call("Context", api.call("Execution"), api.call("Hypothetical"));
  const tried = new Map();
  const run = async (op, a, b) => {
    const e = api.call(op, a, b);
    const key = api.format(e);
    if (!tried.has(key)) {
      let r = undefined;
      try {
        r = await api.evaluate(e, ctx);
      } catch (error) {
        r = undefined;
      }
      tried.set(key, typeof r === "number" && Number.isFinite(r) ? r : undefined);
    }
    return tried.get(key);
  };
  const fn = (rule) => ({ head: "Module", args: [{ value: { head: "Func", args: [{ value: { variable: name } }, { value: api.call("List", ...names.map((n) => ({ variable: n }))) }, { value: api.call("Return", rule) }] } }] });
  // The operations: two-place Concepts that work numbers out and that code can be written for.
  const ops = [];
  for (const u of api.store.all()) {
    const two = u.realizations.some((r) => !r.retired && isCall(r.pattern) && r.pattern.head === u.identity && r.pattern.args.length === 2 && r.pattern.args.every((p) => p.value !== null && typeof p.value === "object" && "variable" in p.value) && !r.properties.some((p) => isCall(p) && p.head === "Effectful"));
    if (!two || (await run(u.identity, 7, 3)) === undefined) continue;
    const written = api.writeCode(fn(api.call(u.identity, { variable: names[0] }, 3)), "JavaScript");
    if (written.unwritable.length || written.text.includes(u.identity + "(")) continue;
    const r = await run(u.identity, 7, 3);
    if (!ops.some((o) => o.r === r)) ops.push({ op: u.identity, r });
  }
  // A candidate is [rule, value of it for each example]. Operands are the arguments and constants.
  const done = (rule) => {
    const code = fn(rule);
    const written = api.writeCode(code, "JavaScript");
    return api.call("Derived", { head: "SourceCode", args: [{ value: written.text }, { name: "language", value: api.call("JavaScript") }, { name: "ir", value: code }] }, name);
  };
  const mentions = (e, n) => (e !== null && typeof e === "object" && "variable" in e ? e.variable === n : isCall(e) && e.args.some((a) => mentions(a.value, n)));
  // With more than one argument a rule uses them all: a rule that ignores one fits the examples by chance.
  const uses = (rule) => names.every((n) => mentions(rule, n));
  const fits = (values) => values.every((v, i) => v !== undefined && same(v, outs[i]));
  if (outs.every((o) => same(o, outs[0]))) return done(outs[0]);
  const vars = names.map((n, k) => [{ variable: n }, ins.map((i) => i[k])]);
  if (arity === 1 && fits(vars[0][1])) return done(vars[0][0]);
  const apply = async (op, x, y) => {
    const values = [];
    for (let i = 0; i < outs.length; i++) values.push(x[1][i] === undefined || y[1][i] === undefined ? undefined : await run(op, x[1][i], y[1][i]));
    return [api.call(op, x[0], y[0]), values];
  };
  const constant = (k) => [k, outs.map(() => k)];
  // Constants that turn a value into the first answer, by any operation, either way round.
  const constantsFor = async (x) => {
    const found = [];
    for (const { op } of ops) for (const k of [await run(op, outs[0], x[1][0]), await run(op, x[1][0], outs[0])]) if (k !== undefined && Number.isInteger(k * 1000) && !found.some((f) => same(f, k))) found.push(k);
    return found;
  };
  const oneStep = async (x) => {
    for (const { op } of ops) for (const k of await constantsFor(x)) for (const [p, q] of [[x, constant(k)], [constant(k), x]]) {
      const c = await apply(op, p, q);
      if (uses(c[0]) && fits(c[1])) return c;
    }
    return undefined;
  };
  for (const v of arity === 1 ? vars : []) {
    const c = await oneStep(v);
    if (c) return done(c[0]);
  }
  const pairs = [];
  for (const p of vars) for (const q of vars) for (const { op } of ops) pairs.push(await apply(op, p, q));
  for (const c of pairs) if (uses(c[0]) && fits(c[1])) return done(c[0]);
  // Two operations: a first step on the arguments (with a small constant, or between them), then one more.
  const firsts = [];
  for (const v of vars) for (const { op } of ops) for (const k of [1, 2, 3, 10]) firsts.push(await apply(op, v, constant(k)));
  firsts.push(...pairs);
  const useful = firsts.filter((f) => !f[1].some((x) => x === undefined) && !vars.some((v) => JSON.stringify(v[1]) === JSON.stringify(f[1])));
  for (const f of useful) {
    const c = await oneStep(f);
    if (c) return done(c[0]);
  }
  for (const f of useful) {
    for (const v of vars) for (const { op } of ops) for (const [p, q] of [[f, v], [v, f]]) {
      const d = await apply(op, p, q);
      if (uses(d[0]) && fits(d[1])) return done(d[0]);
    }
  }
  return api.call("NoRule", name);
};
