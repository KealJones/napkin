// @realization ListMeant($said, $make), context = Execution(), evaluateArguments = false
// The list the words mean: of the lists made, one whose kind is what they say of it ("my shopping
// list" is a List(Shopping())), newest first, else the newest list at all. With make true and none
// made, one is started. The call itself when there is none.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = bindings.get("said");
  const make = api.toHost(bindings.get("make")) === true;
  const made = (h) => /_[0-9]+$/.test(h) && (api.store.get(h)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "List");
  const find = (e) => {
    if (!isCall(e)) return undefined;
    if (e.head === "List" || made(e.head)) return e;
    for (const a of e.args) {
      const inner = find(a.value);
      if (inner) return inner;
    }
    return undefined;
  };
  const named = find(said);
  if (named && named.head !== "List") return named;
  const described = named ?? api.call("List");
  const kind = described.args.filter((a) => a.name === undefined).map((a) => api.format(a.value));
  const seq = (r) => Math.max(0, ...(r.stamps ?? []).map((s) => s.seq));
  const lists = [];
  for (const unit of api.store.all()) {
    if (!/_[0-9]+$/.test(unit.identity)) continue;
    for (const r of unit.relations) {
      const k = isCall(r.claim) && r.claim.head === "IsA" ? r.claim.args[0].value : undefined;
      if (isCall(k) && k.head === "List") lists.push({ id: unit.identity, kind: k.args.map((a) => api.format(a.value)), at: seq(r) });
    }
  }
  lists.sort((a, b) => b.at - a.at);
  const fits = lists.filter((l) => kind.every((k) => l.kind.includes(k)));
  const found = fits[0] ?? (kind.length ? undefined : lists[0]);
  if (found) return api.call(found.id);
  if (!make) return api.call("ListMeant", said, bindings.get("make"));
  // Started: named by its kind ("ShoppingList"), and what it is, sourced from what asked for it.
  const base = described.args.map((a) => (isCall(a.value) ? a.value.head : "")).join("") + "List";
  const list = await api.evaluate(api.call("Mint", base), api.call("Execution"));
  api.store.addRelation(list.head, api.call("IsA", described), undefined, api.trace.cause);
  return list;
};
