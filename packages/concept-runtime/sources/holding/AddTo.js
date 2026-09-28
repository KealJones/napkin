// @realization Add(Ref(Rest($r)), $said), context = Execution(), evaluateArguments = false
// "add cheetos to my shopping list": put in the thing it names; naming none, Add's next realization adds.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Add"), bindings.get("said")), api.context);
  return done && done.head === "Change" ? api.call("Add", args[0].value, bindings.get("said")) : done;
};
