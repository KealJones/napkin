// @realization Add($item, $said), context = Execution(), evaluateArguments = false
// "add milk and eggs to my list", heard as the two things Add takes: put in the thing named;
// naming none, Add's next realization adds.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Add"), api.call("And", bindings.get("item"), bindings.get("said"))), api.context);
  return done && done.head === "Change" ? api.call("Add", bindings.get("item"), bindings.get("said")) : done;
};
