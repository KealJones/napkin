// @realization Superlative($word, $kind), context = Execution()
// "The tallest mountain": the one of a kind with the most (or least) of what the word measures.
// Wiktionary says the word is the superlative of a base ("superlative form of tall"). Which way it
// goes is the base's own superlative when Napkin knows it (small is Smallest), or one the base's
// gloss names ("of greater than average height": Greatest, which is Largest); when nothing says,
// both ways are answered, as a conditional. What it measures is the quantity the kind's items
// have whose name the base or its gloss shares a word with ("height", elevation above sea level),
// else the one they have most. Superlative(item, value, unit, measure, from = Wikidata(item)),
// Either(most, least), or the call itself.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const word = api.lemma(String(bindings.get("word")).toLowerCase()) === String(bindings.get("word")).toLowerCase() ? String(bindings.get("word")).toLowerCase() : String(bindings.get("word")).toLowerCase();
  const kind = bindings.get("kind");
  const none = api.call("Superlative", word, kind);
  if (!isCall(kind) || kind.args.length) return none;
  const glossesOf = async (w) => {
    const s = await api.evaluate(api.call("Senses", w, "Adjective"));
    return isCall(s) && s.head === "Senses" ? s.args[1].value.args.map((a) => String(a.value)) : [];
  };
  const base = (await glossesOf(word)).map((g) => /superlative (?:form|degree) of (\w+)/i.exec(g)?.[1]).find(Boolean);
  if (!base) return none;
  const baseGlosses = await glossesOf(base);
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  // Which way: a superlative Napkin knows, of the base or of a word its first gloss names (not
  // one it negates, "not large").
  const way = (w) => {
    const unit = api.store.get(cap(w) + "est") ?? api.store.get(cap(w));
    if (!unit) return undefined;
    if (unit.identity === "Largest" || unit.identity === "Smallest") return unit.identity;
    const same = unit.relations.map((r) => r.claim).find((c) => isCall(c) && c.head === "SynonymOf" && isCall(c.args[0]?.value));
    const to = same ? same.args[0].value.head : undefined;
    return to === "Largest" || to === "Smallest" ? to : undefined;
  };
  let direction = way(base);
  for (const gloss of baseGlosses.slice(0, 4)) {
    if (direction) break;
    const words = gloss.toLowerCase().match(/[a-z]+/g) ?? [];
    for (let i = 0; i < words.length && !direction; i++) if (words[i - 1] !== "not") direction = way(api.lemma(words[i]));
  }
  // The kind's item, and a sample of its instances.
  const kindWord = kind.head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  let item = undefined;
  for (const r of api.store.get(kind.head)?.relations ?? []) {
    const c = r.claim;
    if (!item && isCall(c) && c.head === "SameAs" && isCall(c.args[0]?.value) && c.args[0].value.head === "Wikidata") item = String(c.args[0].value.args[0].value);
  }
  if (!item) {
    const senses = await api.evaluate(api.call("WikidataSenses", api.lemma(kindWord)));
    if (isCall(senses) && senses.head === "List" && senses.args.length) item = String(senses.args[0].value.args[0].value);
  }
  if (!item) return none;
  // What the kind's best-known instances are measured by. Its own instances, unless the world
  // hardly writes about them: then those of its kinds too (Jupiter is a gas giant, a planet).
  const sampleOf = async (member) => api.toHost(await api.evaluate(api.call("Sparql", "SELECT ?i ?s WHERE { ?i " + member + " wd:" + item + " ; wikibase:sitelinks ?s . } ORDER BY DESC(?s) LIMIT 40")));
  let member = "wdt:P31";
  let sample = await sampleOf(member);
  if (!Array.isArray(sample) || !sample.length || Number(sample[0].s) < 30) {
    member = "wdt:P31/wdt:P279*";
    sample = await sampleOf(member);
  }
  if (!Array.isArray(sample) || !sample.length) return none;
  const claims = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" + sample.map((r) => r.i).join("|"))));
  const count = {};
  for (const e of Object.values((claims && claims.entities) || {})) for (const [p, snaks] of Object.entries(e.claims || {})) if (snaks[0] && snaks[0].mainsnak && snaks[0].mainsnak.datatype === "quantity") count[p] = (count[p] || 0) + 1;
  const measured = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p]) => p);
  if (!measured.length) return none;
  const props = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels|aliases&languages=en&format=json&ids=" + measured.join("|"))));
  const names = (p) => {
    const e = props && props.entities ? props.entities[p] : undefined;
    return [e?.labels?.en?.value, ...((e?.aliases?.en || []).map((a) => a.value))].filter(Boolean).join(" ").toLowerCase();
  };
  const said = new Set([base, ...(baseGlosses.slice(0, 4).join(" ").toLowerCase().match(/[a-z]{4,}/g) ?? [])]);
  const fits = (p) => (names(p).match(/[a-z]{4,}/g) ?? []).some((w) => [...said].some((s) => w.startsWith(s) || s.startsWith(w)));
  // The measure the most words fit, the one the kind's items have most when none do.
  const score = (p) => (names(p).match(/[a-z]{4,}/g) ?? []).filter((w) => [...said].some((x) => w.startsWith(x) || x.startsWith(w))).length;
  const ranked = [...measured].sort((a, b) => score(b) - score(a));
  const measure = ranked[0];
  // Two measures the words fit as well as each other: both answered.
  const alsoMeasure = ranked[1] !== undefined && score(ranked[1]) > 0 && score(ranked[1]) === score(ranked[0]) ? ranked[1] : undefined;
  const labelOf = (m) => props?.entities?.[m]?.labels?.en?.value || m;
  const top = async (order, measure = ranked[0]) => {
    const label = labelOf(measure);
    const rows = api.toHost(await api.evaluate(api.call("Sparql",
      // Among the items the world writes about (sitelinks): the answer is one of those, and a
      // query across every item of a kind takes longer than an answer should.
      "SELECT ?i ?iLabel ?v ?uLabel WHERE { ?i " + member + " wd:" + item + " ; wikibase:sitelinks ?s . FILTER(?s > 30) ?i p:" + measure + "/psv:" + measure + "/wikibase:quantityNormalized ?q . ?q wikibase:quantityAmount ?v ; wikibase:quantityUnit ?u . SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". } } ORDER BY " + order + "(?v) LIMIT 1")));
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return undefined;
    const name = String(row.iLabel);
    const identity = name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map(cap).join("");
    if (identity && !api.store.get(identity)?.relations.some((r) => isCall(r.claim) && r.claim.head === "Named")) api.store.addRelation(identity, api.call("Named", name), undefined, api.trace.cause);
    return { head: "Superlative", args: [{ value: api.call(identity || "Thing") }, { value: Number(row.v) }, { value: String(row.uLabel || "") }, { value: label }, { name: "most", value: order === "DESC" }, { name: "from", value: api.call("Wikidata", String(row.i)) }] };
  };
  if (direction) {
    const order = direction === "Largest" ? "DESC" : "ASC";
    const first = await top(order);
    const second = alsoMeasure ? await top(order, alsoMeasure) : undefined;
    return first && second && api.format(first.args[0].value) !== api.format(second.args[0].value) ? api.call("Either", first, second) : first ?? none;
  }
  const most = await top("DESC");
  const least = await top("ASC");
  return most && least ? api.call("Either", most, least) : none;
};
