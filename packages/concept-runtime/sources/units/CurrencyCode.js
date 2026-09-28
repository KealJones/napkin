// @realization CurrencyCode($unit), context = Execution()
// A currency's ISO 4217 code ("dollars" is USD), from the Wikidata item of whichever sense of the
// word has one (P498). Kept as CurrencyCode(code) on the currency, stamped from the item. The
// call itself when no sense is a currency.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const unit = bindings.get("unit");
  if (!isCall(unit) || unit.args.length) return api.call("CurrencyCode", unit);
  const word = api.lemma(unit.head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  const name = word.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  for (const r of api.store.get(name)?.relations ?? []) if (isCall(r.claim) && r.claim.head === "CurrencyCode" && typeof r.claim.args[0]?.value === "string") return r.claim.args[0].value;
  const items = [];
  for (const r of api.store.get(name)?.relations ?? []) {
    const c = r.claim;
    if (isCall(c) && c.head === "SameAs" && isCall(c.args[0]?.value) && c.args[0].value.head === "Wikidata") items.push(String(c.args[0].value.args[0].value));
  }
  const found = await api.evaluate(api.call("WikidataSenses", word));
  if (isCall(found) && found.head === "List") for (const a of found.args) if (isCall(a.value) && a.value.head === "Wikidata") items.push(String(a.value.args[0].value));
  for (const item of [...new Set(items)].slice(0, 6)) {
    const got = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=" + item + "&property=P498&format=json")));
    const code = got && got.claims && Array.isArray(got.claims.P498) ? got.claims.P498[0]?.mainsnak?.datavalue?.value : undefined;
    if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) continue;
    const record = api.store.addRelation("Wikidata", { head: "Imported", args: [{ value: item }, { name: "license", value: "CC0" }] }, undefined, api.trace.cause);
    api.store.addRelation(name, api.call("CurrencyCode", code), undefined, record.seq);
    return code;
  }
  return api.call("CurrencyCode", unit);
};
