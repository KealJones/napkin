// @realization What(Is(On($said))), context = Execution(), evaluateArguments = false
// "what's on the list": what the thing it names holds.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Held", bindings.get("said")), api.context);
  return done && done.head === "Held" ? api.call("What", args[0].value) : done;
};
