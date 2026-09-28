// @realization Add(Ref(Rest($r)), $said), context = Execution(), evaluateArguments = false
// "add cheetos to my shopping list": put on the list it names. Naming no list ("add 5", after 4),
// what the empty slot stands for is what it adds to, done again without the slot.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const done = await api.evaluate(api.call("ListChange", api.call("Add"), said), api.context);
  if (!(done && done.head === "ListChange")) return done;
  const slot = await api.evaluate(args[0].value);
  if (slot && slot.head === "Ref") return api.call("Add", args[0].value, said);
  return api.evaluate(api.call("Add", slot, said));
};
