// @realization Converted($code), context = Speaking(), evaluateArguments = false
// Code in another language: which, then the code.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const code = bindings.get("code");
  const language = isCall(code) ? code.args.find((a) => a.name === "language")?.value : undefined;
  const shown = await api.evaluate(code, api.call("Speaking"));
  return "In " + (isCall(language) ? language.head : "that language") + ":\n\n" + (typeof shown === "string" ? shown : "");
};
