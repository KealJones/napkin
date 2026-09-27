// @realization What(Is(InlineCode($text, Rest($more)))), context = Context(Execution(), Interrogative()), evaluateArguments = false
// "what is `2 ** 8`?" asks what the code shown works out to: running it (Run).
async (args, bindings, api) => {
  return api.evaluate(api.call("Run", args[0].value.args[0].value), api.context);
};
