// @realization What(Is(In(), $said)), context = Execution(), evaluateArguments = false
// "what is in my list?": what the thing it names holds.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Held", bindings.get("said")), api.context);
  return done && done.head === "Held" ? api.call("What", args[0].value) : done;
};
