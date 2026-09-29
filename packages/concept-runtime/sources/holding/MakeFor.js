// @realization Write($for, $said), context = Execution(), evaluateArguments = false, types = Types(said = Collection())
// "make me a shopping list": who it is for is said, and the list is made as any is.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Write", bindings.get("said")), api.context);
  return done && done.head === "Write" ? api.call("Write", bindings.get("for"), bindings.get("said")) : done;
};
