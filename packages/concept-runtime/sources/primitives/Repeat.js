// @realization Repeat($t, $n), context = Execution()
// Text said again and again, n times in all.
async (args, bindings, api) => {
  const t = bindings.get("t");
  const n = bindings.get("n");
  return typeof t === "string" && Number.isInteger(n) && n >= 0 ? t.repeat(n) : api.call("Repeat", t, n);
};
