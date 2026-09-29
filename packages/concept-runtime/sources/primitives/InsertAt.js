// @realization InsertAt($xs, $i, $x), context = Execution(), types = Types(xs = ListOf($T), i = Number())
// A list with an item put in at a position, counting from 0.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  const i = bindings.get("i");
  if (!Number.isInteger(i)) return api.call("InsertAt", xs, i, bindings.get("x"));
  const items = xs.args.map((a) => a.value);
  items.splice(i, 0, bindings.get("x"));
  return api.call("List", ...items);
};
