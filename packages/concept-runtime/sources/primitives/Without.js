// @realization Without($xs, $x), context = Execution()
// A list with every item equal to one taken out.
async (args, bindings, api) => {
  const xs = bindings.get("xs");
  const x = bindings.get("x");
  const isList = xs !== null && typeof xs === "object" && xs.head === "List";
  if (!isList) return api.call("Without", xs, x);
  return api.call("List", ...xs.args.map((a) => a.value).filter((v) => api.format(v) !== api.format(x)));
};
