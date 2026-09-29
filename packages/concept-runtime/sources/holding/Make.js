// @realization Write($said), context = Execution(), evaluateArguments = false, types = Types(said = Collection())
// "make a shopping list": a thing of that kind, made here, when none is in play yet. Its kind
// (ShoppingList) is a kind of what was said (List), so "my list" finds it too. What it is made
// with ("with eggs, aspirin and cheese") is put in it.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const whole = bindings.get("said");
  // The things it is made with are what goes in it, not what kind of thing it is.
  const withs = whole.args.filter((a) => a.name === undefined && isCall(a.value) && a.value.head === "With");
  const said = { head: whole.head, args: whole.args.filter((a) => !withs.includes(a)) };
  const kind = await api.evaluate(api.call("KindNamed", said), api.call("Execution"));
  if (!isCall(kind) || kind.head === "KindNamed") return api.call("Write", whole);
  // One of exactly that kind already in play is the one meant ("make a shopping list", said
  // again); "make a list" after a grocery list makes a list.
  let thing = await api.evaluate(api.call("ReferentOf", said), api.call("Execution"));
  const exactly = isCall(thing) && thing.head !== "ReferentOf" && api.typesOf(thing)[1] === kind.head;
  if (!exactly) {
    if (kind.head !== said.head && !api.typesOf(kind).includes(said.head)) api.store.addRelation(kind.head, api.call("IsA", api.call(said.head)), undefined, api.trace.cause);
    thing = await api.evaluate(api.call("Mint", kind.head), api.call("Execution"));
    api.store.addRelation(thing.head, api.call("IsA", kind), undefined, api.trace.cause);
  }
  // Made or found again, it is what this message is about now: said so with its kind, stamped
  // by this message, so what the rest of it names goes in it (Fills).
  if (exactly) api.store.addRelation(thing.head, api.call("IsA", kind), undefined, api.trace.cause);
  const made = api.call("Made", thing);
  if (!withs.length) return made;
  const items = withs.flatMap((w) => w.value.args.filter((a) => a.name === undefined).map((a) => a.value));
  const added = await api.evaluate(api.call("Change", api.call("Add"), api.call("And", ...items, api.call("To", thing))), api.context);
  return added && added.head !== "Change" ? api.call("Sequence", made, added) : made;
};
