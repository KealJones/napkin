// @realization Held($said), context = Execution(), evaluateArguments = false
// What the thing the words name holds: every item put in it and not taken out. The call itself
// when the words name nothing made.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = bindings.get("said");
  const thing = await api.evaluate(api.call("ReferentOf", said), api.call("Execution"));
  if (!isCall(thing) || thing.head === "ReferentOf") return api.call("Held", said);
  const items = (api.store.get(thing.head)?.relations ?? [])
    .filter((r) => isCall(r.claim) && r.claim.head === "Contains" && !api.store.retracted(thing.head, r.claim))
    .map((r) => r.claim.args[0].value);
  return api.call("Answer", api.call("List", ...items));
};
