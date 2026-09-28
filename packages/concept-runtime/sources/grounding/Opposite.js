// @realization Opposite($x), context = Execution()
// The opposite of a thing with two ends has them the other way round: Direction(a, b) is
// Direction(b, a). Anything else stays as said.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const x = bindings.get("x");
  if (isCall(x) && x.head === "Direction" && x.args.length === 2) return api.call("Direction", x.args[1].value, x.args[0].value);
  return api.call("Opposite", x);
};
