// @realization Trim($t), context = Execution(), types = Types(t = String())
// Text without the spaces at either end.
async (args, bindings, api) => {
  return bindings.get("t").trim();
};
