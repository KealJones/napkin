// @realization Write($said), context = Execution(), evaluateArguments = false, types = Types(said = Collection())
// "make a shopping list": a thing of that kind, made here, when none is in play yet. Its kind
// (ShoppingList) is a kind of what was said (List), so "my list" finds it too.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = bindings.get("said");
  const found = await api.evaluate(api.call("ReferentOf", said), api.call("Execution"));
  if (isCall(found) && found.head !== "ReferentOf") return api.call("Made", found);
  const kind = await api.evaluate(api.call("KindNamed", said), api.call("Execution"));
  if (!isCall(kind) || kind.head === "KindNamed") return api.call("Write", said);
  if (kind.head !== said.head && !api.typesOf(kind).includes(said.head)) api.store.addRelation(kind.head, api.call("IsA", api.call(said.head)), undefined, api.trace.cause);
  const thing = await api.evaluate(api.call("Mint", kind.head), api.call("Execution"));
  api.store.addRelation(thing.head, api.call("IsA", kind), undefined, api.trace.cause);
  return api.call("Made", thing);
};
