// @realization InSI($unit), context = Execution()
// What one of a unit is in the SI unit of its kind: InSI(Unit, amount, Wikidata(si), from =
// Wikidata(item)). The unit is the word's base form ("Ounces" is Ounce); its senses are the
// Wikidata items the graph holds for it and those Wikidata finds for the word, and the first with
// a conversion to an SI unit is the one meant. Kept as InSI(amount, Wikidata(si)) on the unit,
// stamped from the item. The call itself when no sense has one.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const unit = bindings.get("unit");
  if (!isCall(unit) || unit.args.length) return api.call("InSI", unit);
  const word = api.lemma(unit.head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  const name = word.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  const answer = (amount, si, item) => ({ head: "InSI", args: [{ value: api.call(name) }, { value: amount }, { value: si }, ...(item ? [{ name: "from", value: api.call("Wikidata", item) }] : [])] });
  // Kept already.
  for (const r of api.store.get(name)?.relations ?? []) {
    const c = r.claim;
    if (!isCall(c) || c.head !== "InSI" || typeof c.args[0]?.value !== "number") continue;
    const record = r.stamps?.[0]?.source !== undefined ? api.store.findStamp(r.stamps[0].source)?.relation.claim : undefined;
    return answer(c.args[0].value, c.args[1].value, isCall(record) ? record.args[0]?.value : undefined);
  }
  // The senses: what the graph holds the word is on Wikidata, then what Wikidata finds for it.
  const items = [];
  for (const r of api.store.get(name)?.relations ?? []) {
    const c = r.claim;
    if (isCall(c) && c.head === "SameAs" && isCall(c.args[0]?.value) && c.args[0].value.head === "Wikidata") items.push(String(c.args[0].value.args[0].value));
  }
  const found = await api.evaluate(api.call("WikidataSenses", word));
  if (isCall(found) && found.head === "List") for (const a of found.args) if (isCall(a.value) && a.value.head === "Wikidata") items.push(String(a.value.args[0].value));
  for (const item of [...new Set(items)].slice(0, 6)) {
    const got = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=" + item + "&property=P2370&format=json")));
    const value = got && got.claims && Array.isArray(got.claims.P2370) ? got.claims.P2370[0]?.mainsnak?.datavalue?.value : undefined;
    const amount = value ? Number(value.amount) : NaN;
    const si = value && typeof value.unit === "string" ? value.unit.split("/").pop() : undefined;
    if (!Number.isFinite(amount) || !si) continue;
    const record = api.store.addRelation("Wikidata", { head: "Imported", args: [{ value: item }, { name: "license", value: "CC0" }] }, undefined, api.trace.cause);
    api.store.addRelation(name, api.call("InSI", amount, api.call("Wikidata", si)), undefined, record.seq);
    return answer(amount, api.call("Wikidata", si), item);
  }
  return api.call("InSI", unit);
};
