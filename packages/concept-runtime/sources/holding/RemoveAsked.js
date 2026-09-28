// @realization Remove($said), context = Interrogative(), evaluateArguments = false
// "can you remove milk from my list?": asked for, so done.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Remove"), bindings.get("said")), api.context);
  return done && done.head === "Change" ? api.call("Remove", bindings.get("said")) : done;
};
