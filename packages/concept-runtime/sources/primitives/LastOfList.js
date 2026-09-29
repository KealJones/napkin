// @realization Last($xs), context = Execution(), types = Types(xs = ListOf($T))
// The last item of a list.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  return xs.args.length ? xs.args[xs.args.length - 1].value : api.call("Nothing");
};
