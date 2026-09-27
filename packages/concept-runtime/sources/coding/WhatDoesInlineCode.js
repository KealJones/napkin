// @realization What(Does(InlineCode($text, Rest($more)), $doing)), context = Context(Execution(), Interrogative()), evaluateArguments = false
// "what does `this` give / return?" of code shown is what running it gives (Run); "do" is what
// it does, in words (Explain).
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const doing = bindings.get("doing");
  const does = isCall(doing) && doing.head === "Do" && !doing.args.length;
  return api.evaluate(api.call(does ? "Explain" : "Run", args[0].value.args[0].value), api.context);
};
