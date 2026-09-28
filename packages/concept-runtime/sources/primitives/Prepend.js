// @realization Prepend($xs, $x), context = Execution()
// A list with one more item at its start.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  const isList = xs !== null && typeof xs === "object" && xs.head === "List";
  return isList ? api.call("List", bindings.get("x"), ...xs.args.map((a) => a.value)) : api.call("Prepend", xs, bindings.get("x"));
};
