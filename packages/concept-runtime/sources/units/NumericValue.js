// @realization NumericValue($x), context = Execution()
// The number a thing is, when it is one (pi, e, the golden ratio): its Wikidata item's numeric
// value (P1181), kept as NumericValue(n) on it, stamped from the item. The call itself otherwise.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const x = bindings.get("x");
  if (!isCall(x) || x.args.length) return api.call("NumericValue", x);
  const unit = api.store.get(x.head);
  for (const r of unit?.relations ?? []) if (isCall(r.claim) && r.claim.head === "NumericValue" && typeof r.claim.args[0]?.value === "number") return r.claim.args[0].value;
  const items = (unit?.relations ?? []).map((r) => r.claim).filter((c) => isCall(c) && c.head === "SameAs" && isCall(c.args[0]?.value) && c.args[0].value.head === "Wikidata").map((c) => String(c.args[0].value.args[0].value));
  for (const item of items) {
    const got = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=" + item + "&property=P1181&format=json")));
    const value = got && got.claims && Array.isArray(got.claims.P1181) ? got.claims.P1181[0]?.mainsnak?.datavalue?.value : undefined;
    const n = value ? Number(value.amount) : NaN;
    if (!Number.isFinite(n)) continue;
    const record = api.store.addRelation("Wikidata", { head: "Imported", args: [{ value: item }, { name: "license", value: "CC0" }] }, undefined, api.trace.cause);
    api.store.addRelation(x.head, api.call("NumericValue", n), undefined, record.seq);
    return n;
  }
  return api.call("NumericValue", x);
};
