// @realization Remove($said), context = Imperative(), evaluateArguments = false
// "remove milk from my list": taken out of the thing it names.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Remove"), bindings.get("said")), api.context);
  return done && done.head === "Change" ? api.call("Remove", bindings.get("said")) : done;
};
