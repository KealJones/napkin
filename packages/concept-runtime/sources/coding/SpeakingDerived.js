// @realization Derived(Rest($x)), context = Speaking(), evaluateArguments = false
// A function written for what was asked: its name (and that it fits the examples, when it was
// found from them), then the code.
async (args, bindings, api) => {
  const positional = args.filter((a) => a.name === undefined).map((a) => a.value);
  const fits = args.some((a) => a.name === "fits");
  const shown = await api.evaluate(positional[0], api.call("Speaking"));
  return "Here's " + String(positional[1]) + (fits ? ", which gives back every example you gave" : "") + ":\n\n" + (typeof shown === "string" ? shown : "");
};
