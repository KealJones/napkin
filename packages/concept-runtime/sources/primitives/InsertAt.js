// @realization InsertAt($xs, $i, $x), context = Execution()
// A list with an item put in at a position, counting from 0.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  const i = bindings.get("i");
  const isList = xs !== null && typeof xs === "object" && xs.head === "List";
  if (!isList || !Number.isInteger(i)) return api.call("InsertAt", xs, i, bindings.get("x"));
  const items = xs.args.map((a) => a.value);
  items.splice(i, 0, bindings.get("x"));
  return api.call("List", ...items);
};
