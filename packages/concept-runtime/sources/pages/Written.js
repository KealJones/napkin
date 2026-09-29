// @realization Written($goal), context = Execution(), evaluateArguments = false
// What was asked, read from a page someone wrote: Found(Page(...)), or the call itself. Where to
// look comes from the words asked. A word whose Wikidata sense has a page in a namespace of a
// sister project names a kind written there ("recipe": the Cookbook on Wikibooks), and the rest of
// the words are what to look for in it. A question that asks for steps ("how do you bake a cake")
// is looked for, all its words, where steps are written, when one of its words can be a doing.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const goal = bindings.get("goal");
  if (!isCall(goal)) return api.call("Written", goal);
  const heads = [];
  const walk = (e) => {
    if (!isCall(e)) return;
    if (!heads.includes(e.head)) heads.push(e.head);
    for (const a of e.args) if (a.name === undefined) walk(a.value);
  };
  walk(goal);
  // The words that say what, not how it is asked: none a pack declares ("do", "you", "how").
  const declared = (h) => {
    const u = api.store.get(h);
    return !!u && (u.realizations.length > 0 || u.relations.some((r) => (r.stamps || []).some((st) => st.pack !== undefined)));
  };
  const text = (h) => h.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  const open = heads.filter((h) => !declared(h));
  if (!open.length) return api.call("Written", goal);
  const places = [];
  const namespaces = new Map();
  const spaces = async (site) => {
    if (!namespaces.has(site)) {
      const got = api.toHost(await api.evaluate(api.call("Fetch", site + "/w/api.php?action=query&meta=siteinfo&siprop=namespaces&format=json&origin=*")));
      namespaces.set(site, got && got.query && got.query.namespaces ? Object.values(got.query.namespaces) : []);
    }
    return namespaces.get(site);
  };
  // A kind, by where its word's sense is written.
  for (const w of open) {
    const others = open.filter((h) => h !== w);
    if (!others.length) continue;
    const senses = await api.evaluate(api.call("WikidataSenses", text(w)));
    const ids = isCall(senses) && senses.head === "List" ? senses.args.slice(0, 3).map((a) => a.value.args[0].value) : [];
    if (!ids.length) continue;
    const got = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&format=json&origin=*&ids=" + ids.join("|"))));
    for (const id of ids) {
      const links = got && got.entities && got.entities[id] && got.entities[id].sitelinks ? got.entities[id].sitelinks : {};
      for (const key of Object.keys(links)) {
        if (!/^en[a-z]+$/.test(key) || key === "enwiki") continue;
        const title = String(links[key].title || "");
        const colon = title.indexOf(":");
        if (colon < 1) continue;
        const site = "https://en." + key.slice(2) + ".org";
        const space = (await spaces(site)).find((n) => n["*"] === title.slice(0, colon));
        if (space && !places.some((p) => p.site === site && p.ns === String(space.id))) places.push({ site: site, ns: String(space.id), titled: others.map(text), also: [] });
      }
    }
  }
  // Steps, where they are written, for a question about doing something.
  const asks = heads
    .map((h) => (api.store.get(h)?.relations ?? []).map((r) => r.claim).find((c) => isCall(c) && c.head === "Asks"))
    .find((c) => c);
  const kind = asks && isCall(asks.args[0].value) ? asks.args[0].value.head : undefined;
  const at = kind ? (api.store.get(kind)?.relations ?? []).map((r) => r.claim).find((c) => isCall(c) && c.head === "WrittenAt") : undefined;
  if (at && isCall(at.args[0].value)) {
    const site = (api.store.get(at.args[0].value.head)?.relations ?? []).map((r) => r.claim).find((c) => isCall(c) && c.head === "Site");
    // A word is what the dictionary gives first for it: "bake" a doing, "cake" a thing. A doing
    // a pack knows ("make") is one too; how it is asked ("do", "you", "how") is neither.
    const doings = [];
    const things = [];
    for (const h of heads) {
      const kinds = api.typesOf(api.call(h));
      if (!open.includes(h) && ["Helper", "Deictic", "QuestionWord", "Marker", "MoodKind"].some((k) => kinds.includes(k))) continue;
      const can = await api.evaluate(api.call("PartsOfSpeech", text(h)));
      const first = isCall(can) && can.head === "List" && can.args.length && isCall(can.args[0].value) ? can.args[0].value.head : undefined;
      if (first === "Verb") doings.push(text(h));
      else if (open.includes(h)) things.push(text(h));
    }
    if (site && doings.length && things.length) {
      const url = String(site.args[0].value);
      const content = (await spaces(url)).filter((n) => n.content !== undefined).map((n) => String(n.id));
      places.push({ site: url, ns: content.join("|") || "0", titled: things, also: doings, steps: true });
    }
  }
  const clean = (s) =>
    s
      .replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\{[^{}]*\}\}/g, "")
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
      .replace(/\[https?:[^\s\]]+ ([^\]]*)\]/g, "$1")
      .replace(/'{2,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  // A page as its sections that hold lists; a section's own sections are part of it. A section
  // whose items are only links (other recipes, external links) points elsewhere: what it links to
  // is kept apart, to read when the page says nothing itself.
  const read = (raw) => {
    const sections = [];
    const links = [];
    let current = undefined;
    const kinds = [...raw.matchAll(/<categorytree[^>]*>([^<]+)<\/categorytree>/g)].map((m) => m[1].trim());
    for (const line of raw.split("\n")) {
      const heading = /^(=+)\s*(.*?)\s*=+\s*$/.exec(line);
      if (heading) {
        if (heading[1].length <= 2 || !current) {
          current = { heading: clean(heading[2]), items: [], numbered: false, pointers: 0 };
          sections.push(current);
        }
        continue;
      }
      const item = /^([*#]+)\s*(.*)$/.exec(line);
      if (!item || !current) continue;
      const whole = /^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\][\s.,;:]*$/.exec(item[2]);
      if (whole || /^\s*\[https?:[^\]]*\][\s.,;:]*$/.test(item[2])) current.pointers++;
      if (whole) links.push(whole[1].trim());
      const said = clean(item[2]);
      if (said) current.items.push(said);
      if (item[1][0] === "#") current.numbered = true;
    }
    return { sections: sections.filter((s) => s.items.length && s.pointers * 2 < s.items.length), links: links, kinds: kinds };
  };
  const pageOf = async (place, title) => {
    const raw = await api.evaluate(api.call("FetchText", place.site + "/w/index.php?action=raw&title=" + encodeURIComponent(title)));
    if (typeof raw !== "string" || /^#REDIRECT/i.test(raw)) return { links: [], kinds: [] };
    const got = read(raw);
    if (!got.sections.length || (place.steps && !got.sections.some((s) => s.numbered))) return got;
    const url = place.site + "/wiki/" + encodeURIComponent(title.split(" ").join("_")).replace(/%3A/g, ":");
    return {
      page: {
        head: "Page",
        args: [
          { value: title.slice(title.indexOf(":") + 1) },
          ...got.sections.map((s) => ({ value: { head: "Section", args: [{ value: s.heading }, { value: api.call("List", ...s.items) }, ...(s.numbered ? [{ name: "numbered", value: true }] : [])] } })),
          { name: "from", value: api.call("Site", url) },
          { name: "license", value: "CC BY-SA 4.0" },
        ],
      },
    };
  };
  // Most linked to first (the page others point at for it), titles that name what was asked.
  const search = async (place, within) => {
    const terms = [...(within ? ['incategory:"' + within + '"'] : []), ...place.titled.map((w) => "intitle:" + w), ...place.also];
    const found = api.toHost(await api.evaluate(api.call("Fetch", place.site + "/w/api.php?action=query&list=search&format=json&origin=*&srlimit=10&srsort=incoming_links_desc&srnamespace=" + encodeURIComponent(place.ns) + "&srsearch=" + encodeURIComponent(terms.join(" ")))));
    return found && found.query && Array.isArray(found.query.search) ? found.query.search.map((h) => String(h.title)) : [];
  };
  for (const place of places) {
    const says = (t) => place.titled.every((w) => t.toLowerCase().includes(w.split(" ").pop().replace(/s$/, "")));
    const titled = (await search(place)).filter(says).slice(0, 4);
    for (const title of titled) {
      const got = await pageOf(place, title);
      if (got.page) return api.call("Found", got.page, goal);
      // A page that only points (Cookbook:Bread, to its recipes for bread): what it points at.
      const next = [...got.links.filter(says)];
      for (const kind of got.kinds) next.push(...(await search(place, kind)).filter(says));
      for (const link of next.filter((l) => !titled.includes(l)).slice(0, 3)) {
        const then = await pageOf(place, link);
        if (then.page) return api.call("Found", then.page, goal);
      }
    }
  }
  return api.call("Written", goal);
};
