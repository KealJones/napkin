// @realization What(Does($thing, Do())), context = Context(Execution(), Interrogative()), evaluateArguments = false
// "what does this do?" of code is what it does, said in words (Explain); of anything else, what
// it is ("what does a plumber do" asks what a plumber is).
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const code = await api.evaluate(api.call("CodeOf", bindings.get("thing")), api.context);
  if (isCall(code) && code.head === "SourceCode") return api.evaluate(api.call("Explain", code), api.context);
  return api.evaluate(api.call("What", bindings.get("thing")), api.context);
};
