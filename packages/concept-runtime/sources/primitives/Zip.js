// @realization Zip($a, $b), context = Execution()
// Two lists side by side: a list of pairs, as long as the shorter.
async (args, bindings, api) => {
  const a = bindings.get("a");
  const b = bindings.get("b");
  const isList = (x) => x !== null && typeof x === "object" && x.head === "List";
  if (!isList(a) || !isList(b)) return api.call("Zip", a, b);
  const n = Math.min(a.args.length, b.args.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push(api.call("List", a.args[i].value, b.args[i].value));
  return api.call("List", ...out);
};
