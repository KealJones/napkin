// @realization Without($xs, $x), context = Execution(), types = Types(xs = ListOf($T))
// A list with every item equal to one taken out.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  const x = bindings.get("x");
  return api.call("List", ...xs.args.map((a) => a.value).filter((v) => api.format(v) !== api.format(x)));
};
