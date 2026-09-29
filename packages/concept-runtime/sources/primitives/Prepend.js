// @realization Prepend($xs, $x), context = Execution(), types = Types(xs = ListOf($T))
// A list with one more item at its start.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  return api.call("List", bindings.get("x"), ...xs.args.map((a) => a.value));
};
