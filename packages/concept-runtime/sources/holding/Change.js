// @realization Change($doing, $said), context = Execution(), evaluateArguments = false
// Things put in or taken out of the thing the words name: "add cheetos to my shopping list" is
// heard Cheetos(To(My(List(Shopping())))), where it goes said inside what goes. $doing is Add
// or Remove. Adding to a kind of collection nothing is made of yet makes one. Answered, so a
// statement that does this is taken as done; supposed (Hypothetical), nothing changes. The call
// itself when the words name no such thing.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const doing = bindings.get("doing");
  const said = bindings.get("said");
  const none = api.call("Change", doing, said);
  const adding = isCall(doing) && doing.head === "Add";
  const facets = api.context && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  const supposed = facets.some((f) => isCall(f) && f.head === "Hypothetical");
  // Where: the one word inside that says where (to, on, in, from) and holds what names a thing.
  const refer = async (e) => {
    const r = await api.evaluate(api.call("ReferentOf", e), api.call("Execution"));
    return isCall(r) && r.head !== "ReferentOf" ? r : undefined;
  };
  let target = undefined;
  let place = undefined;
  const look = async (e) => {
    if (!isCall(e) || target) return e;
    const args = [];
    for (const a of e.args) {
      const v = a.value;
      if (!target && a.name === undefined && isCall(v) && v.args.length === 1) {
        const inner = v.args[0].value;
        const found = await refer(inner);
        if (found) {
          target = found;
          continue;
        }
        const collection = isCall(inner) && (await api.evaluate(api.call("Fits", inner, api.call("Collection")), api.call("Execution")));
        if (adding && !supposed && isCall(collection) && collection.head === "True") {
          place = inner;
          continue;
        }
      }
      args.push({ ...a, value: await look(v) });
    }
    return { head: e.head, args };
  };
  const rest = await look(said);
  if (!target && place) {
    const made = await api.evaluate(api.call("Write", place), api.call("Execution"));
    target = isCall(made) && made.head === "Made" ? made.args[0].value : undefined;
  }
  if (!target) return none;
  const items = [];
  const flat = async (e) => {
    if (isCall(e) && ["And", "List", "Sequence"].includes(e.head)) {
      for (const a of e.args) await flat(a.value);
    } else if (isCall(e) && e.head !== "Ref") items.push(await api.evaluate(api.call("Read", e), api.call("Execution")));
  };
  await flat(rest);
  if (!items.length) return none;
  const unit = api.store.get(target.head);
  const held = (item) => (unit?.relations ?? []).filter((r) => isCall(r.claim) && r.claim.head === "Contains" && api.format(r.claim.args[0].value) === api.format(item) && !api.store.retracted(target.head, r.claim));
  for (const item of supposed ? [] : items) {
    if (adding) {
      if (!held(item).length) api.store.addRelation(target.head, api.call("Contains", item), undefined, api.trace.cause);
    } else {
      for (const r of held(item)) for (const s of r.stamps ?? []) api.store.addRelation(target.head, api.call("Retracts", s.seq), undefined, api.trace.cause);
    }
  }
  return api.call("Answer", api.call(adding ? "Added" : "Removed", api.call("List", ...items), target));
};
