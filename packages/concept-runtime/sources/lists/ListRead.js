// @realization ListRead($said), context = Execution(), evaluateArguments = false
// What is on the list the words name: every thing put on it that was not taken off.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = bindings.get("said");
  const list = await api.evaluate(api.call("ListMeant", said, false), api.call("Execution"));
  if (!isCall(list) || list.head === "ListMeant") return api.call("ListRead", said);
  const items = (api.store.get(list.head)?.relations ?? [])
    .filter((r) => isCall(r.claim) && r.claim.head === "ListItem" && !api.store.retracted(list.head, r.claim))
    .map((r) => r.claim.args[0].value);
  return api.call("ListHolds", list, api.call("List", ...items));
};
