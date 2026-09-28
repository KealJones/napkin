// @realization Add(Ref(Rest($r)), $said), context = Execution(), evaluateArguments = false
// "add cheetos to my shopping list": put on the list it names. Naming no list ("add 5", after 4),
// the call itself, and Add's next realization does it.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const done = await api.evaluate(api.call("ListChange", api.call("Add"), said), api.context);
  return done && done.head === "ListChange" ? api.call("Add", args[0].value, said) : done;
};
