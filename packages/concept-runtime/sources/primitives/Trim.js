// @realization Trim($t), context = Execution()
// Text without the spaces at either end.
async (args, bindings, api) => {
  const t = bindings.get("t");
  return typeof t === "string" ? t.trim() : api.call("Trim", t);
};
