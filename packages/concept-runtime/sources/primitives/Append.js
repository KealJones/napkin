// @realization Append($xs, $x), context = Execution()
// A list with one more item at its end.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  const isList = xs !== null && typeof xs === "object" && xs.head === "List";
  return isList ? api.call("List", ...xs.args.map((a) => a.value), bindings.get("x")) : api.call("Append", xs, bindings.get("x"));
};
