// @realization List(Rest($items)), context = Explaining()
// What a function takes, said as a list: "a and b", "a, b and c", "nothing".
async (args, bindings, api) => {
  const parts = args.map((a) => a.value);
  if (parts.some((p) => typeof p !== "string" && typeof p !== "number")) return api.call("List", ...parts);
  const xs = parts.map(String);
  return xs.length === 0 ? "nothing" : xs.length === 1 ? xs[0] : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
};
