// @realization KindNamed($said), context = Execution(), evaluateArguments = false
// The kind a description names: the Concept its words fold to ("shopping list" is ShoppingList
// once it is known), else its describers and its head as one name (ShoppingList), else its head
// (List). Left as said with more than describers in it.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = bindings.get("said");
  const read = await api.evaluate(api.call("Read", said), api.call("Execution"));
  if (isCall(read) && !read.args.length) return read;
  if (!isCall(said) || !said.args.every((a) => a.name === undefined && isCall(a.value) && !a.value.args.length)) return api.call("KindNamed", said);
  return api.call(said.args.map((a) => a.value.head).join("") + said.head);
};
