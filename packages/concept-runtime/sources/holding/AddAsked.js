// @realization Add($said), context = Interrogative(), evaluateArguments = false
// "can you add cheetos to my list?": asked for, so done. Asked, not worked out, so hearing still reads Add as taking two.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Add"), bindings.get("said")), api.context);
  return done && done.head === "Change" ? api.call("Add", bindings.get("said")) : done;
};
