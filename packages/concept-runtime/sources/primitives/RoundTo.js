// @realization RoundTo($x, $places), context = Execution(), types = Types(x = Number())
// A number rounded to so many places after the point.
async (args, bindings, api) => {
  const x = bindings.get("x");
  const p = bindings.get("places");
  if (!Number.isInteger(p)) return api.call("RoundTo", x, p);
  const f = 10 ** p;
  return Math.round(x * f) / f;
};
