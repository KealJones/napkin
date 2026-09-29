// @realization Repeat($t, $n), context = Execution(), types = Types(t = String(), n = Number())
// Text said again and again, n times in all.
async (args, bindings, api) => {
  const t = bindings.get("t");
  const n = bindings.get("n");
  return Number.isInteger(n) && n >= 0 ? t.repeat(n) : api.call("Repeat", t, n);
};
