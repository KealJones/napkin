// @realization Put($said), context = Interrogative(), evaluateArguments = false
// "can you put eggs on my list?": asked for, so done.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Add"), bindings.get("said")), api.context);
  return done && done.head === "Change" ? api.call("Put", bindings.get("said")) : done;
};
