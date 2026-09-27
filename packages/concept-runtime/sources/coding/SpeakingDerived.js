// @realization Derived($code, $name), context = Speaking(), evaluateArguments = false
// A function found from examples: its name, then the code.
async (args, bindings, api) => {
  const shown = await api.evaluate(bindings.get("code"), api.call("Speaking"));
  return "Here's " + String(bindings.get("name")) + ", which gives back every example you gave:\n\n" + (typeof shown === "string" ? shown : "");
};
