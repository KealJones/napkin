// @realization ListChange($doing, $said), context = Execution(), evaluateArguments = false
// Things put on or taken off the list the words name: "add cheetos to my shopping list" is heard
// Cheetos(To(My(List(Shopping())))), the things with the list said inside them. $doing is Add or
// Remove. Answered, so a statement that does this is taken as done. The call itself when the
// words name no list.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const doing = bindings.get("doing");
  const said = bindings.get("said");
  const none = api.call("ListChange", doing, said);
  // A list said (List(Shopping())) or one made here (ShoppingList_1).
  const made = (h) => /_[0-9]+$/.test(h) && (api.store.get(h)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "List");
  const listy = (e) => isCall(e) && (e.head === "List" || made(e.head) || e.args.some((a) => listy(a.value)));
  // The words that say where (to, on, from, off, onto) and hold the list.
  let where = undefined;
  const strip = (e) => {
    if (!isCall(e)) return e;
    const args = [];
    for (const a of e.args) {
      if (!where && a.name === undefined && isCall(a.value) && a.value.args.length && listy(a.value) && a.value.head !== "List" && !made(a.value.head)) where = a.value;
      else args.push({ ...a, value: strip(a.value) });
    }
    return { head: e.head, args };
  };
  const rest = strip(said);
  if (!where) return none;
  const items = [];
  const flat = async (e) => {
    if (isCall(e) && ["And", "List", "Sequence"].includes(e.head)) {
      for (const a of e.args) await flat(a.value);
    } else if (isCall(e) && e.head !== "Ref") items.push(await api.evaluate(api.call("Read", e), api.call("Execution")));
  };
  await flat(rest);
  if (!items.length) return none;
  const adding = isCall(doing) && doing.head === "Add";
  // Supposed, not done ("what if I need milk"): what would change, and nothing changed.
  const facets = api.context && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  const supposed = facets.some((f) => isCall(f) && f.head === "Hypothetical");
  const list = await api.evaluate(api.call("ListMeant", where, adding && !supposed), api.call("Execution"));
  if (!isCall(list) || list.head === "ListMeant") return none;
  const unit = api.store.get(list.head);
  const held = (item) => (unit?.relations ?? []).filter((r) => isCall(r.claim) && r.claim.head === "ListItem" && api.format(r.claim.args[0].value) === api.format(item) && !api.store.retracted(list.head, r.claim));
  for (const item of supposed ? [] : items) {
    if (adding) {
      if (!held(item).length) api.store.addRelation(list.head, api.call("ListItem", item), undefined, api.trace.cause);
    } else {
      for (const r of held(item)) for (const s of r.stamps ?? []) api.store.addRelation(list.head, api.call("Retracts", s.seq), undefined, api.trace.cause);
    }
  }
  return api.call("Answer", api.call(adding ? "ListAdded" : "ListRemoved", api.call("List", ...items), list));
};
