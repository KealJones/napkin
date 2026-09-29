// @realization Append($xs, $x), context = Execution(), types = Types(xs = ListOf($T))
// A list with one more item at its end.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  return api.call("List", ...xs.args.map((a) => a.value), bindings.get("x"));
};
