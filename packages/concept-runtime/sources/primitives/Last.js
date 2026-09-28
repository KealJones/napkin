// @realization Last($xs), context = Execution()
// The last item of a list, or the last letter of text.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  if (typeof xs === "string") return xs.length ? xs[xs.length - 1] : api.call("Nothing");
  const isList = xs !== null && typeof xs === "object" && xs.head === "List";
  if (!isList) return api.call("Last", xs);
  return xs.args.length ? xs.args[xs.args.length - 1].value : api.call("Nothing");
};
