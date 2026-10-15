// @realization Add($said), context = Imperative(), evaluateArguments = false
// "add milk to my shopping list", what is added carrying where it goes (Milk(To(My(List())))):
// put in the thing it names; naming none, it stays to be worked out.
async (args, bindings, api) => {
  const done = await api.evaluate(api.call("Change", api.call("Add"), bindings.get("said")), api.context);
  return done && done.head === "Change" ? api.call("Add", bindings.get("said")) : done;
};
