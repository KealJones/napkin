// @realization Follows($said), context = Execution(), evaluateArguments = false
// What follows from what was told, read off the graph: how its words feel (each word's Valence,
// turned by a word the tagger calls negative just before it, and summed the way VADER sums), and
// what the event it tells of leads to (the event the turn found, `follows`). Follows() when
// neither says anything.
async (args, bindings, api) => {
  const said = args[0] ? args[0].value : undefined;
  if (typeof said !== "string" || !said.trim()) return api.call("Follows");
  const code = (w) => "Word_" + [...w.toLowerCase()].map((ch) => (/[a-z]/.test(ch) ? ch : "x" + ch.codePointAt(0).toString(16))).join("");
  const valence = (w) => {
    for (const t of api.store.asSubject(code(w))) {
      if (t.predicate === "Valence" && t.expr.args[0] && typeof t.expr.args[0].value === "number") return t.expr.args[0].value;
    }
    return undefined;
  };
  const ws = api.words(said);
  let sum = 0;
  let felt = false;
  // The words said in parts (sentences, and what "and" joins), each with how strongly it felt.
  const parts = [];
  let part = { words: [], strength: 0 };
  for (const [i, w] of ws.entries()) {
    if (part.words.length && (w.tags.includes("Conjunction") || (i && w.sentence !== ws[i - 1].sentence))) {
      parts.push(part);
      part = { words: [], strength: 0 };
    }
    if (!w.tags.includes("Conjunction")) part.words.push(w);
    let v = valence(w.text);
    if (v === undefined && w.typed) v = valence(w.typed);
    if (v === undefined) continue;
    felt = true;
    const turned = ws.slice(Math.max(0, i - 3), i).some((x) => x.tags.includes("Negative"));
    const value = turned ? v * -0.74 : v;
    sum += value;
    part.strength = Math.max(part.strength, Math.abs(value));
  }
  if (part.words.length) parts.push(part);
  // What the event leads to counts for how it feels, at half weight: losing a job causes
  // depression, so losing a job is bad even said plainly.
  const event = api.ambient("follows");
  const led = event && api.store.get(event) ? api.store.get(event).relations : [];
  for (const r of led) {
    const claim = r.claim;
    if (r.context !== undefined || !claim || (claim.head !== "Causes" && claim.head !== "Entails" && claim.head !== "CausesDesire")) continue;
    const target = claim.args[0] ? claim.args[0].value : undefined;
    if (!target || !target.head) continue;
    for (const w of target.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ")) {
      const v = valence(w);
      if (v === undefined) continue;
      felt = true;
      sum += v * 0.5;
    }
  }
  // What was told, said back to the one who told it: a word for the one speaking ("my", "I") becomes
  // the word of the same kind for the one spoken to ("your", "you"), by what each Refers to.
  const kinds = (id) => {
    const u = api.store.get(id);
    return u ? u.relations.filter((r) => r.claim && r.claim.head === "IsA" && r.claim.args[0] && r.claim.args[0].value && r.claim.args[0].value.head).map((r) => r.claim.args[0].value.head) : [];
  };
  const refersTo = (id) => {
    for (const t of api.store.asSubject(id)) if (t.predicate === "Refers" && t.expr.args[0] && t.expr.args[0].value && t.expr.args[0].value.head) return t.expr.args[0].value.head;
    for (const t of api.store.asSubject(id)) if (t.predicate === "HeardAs" && t.expr.args[0] && t.expr.args[0].value && t.expr.args[0].value.head && t.expr.args[0].value.head !== id) return refersTo(t.expr.args[0].value.head);
    return undefined;
  };
  const listener = api.store.asObject("Self").filter((t) => t.predicate === "Refers").map((t) => t.subject);
  const suffix = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
    return n;
  };
  const swapped = (word) => {
    const id = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (refersTo(id) !== "Me") return undefined;
    const mine = kinds(id).concat(...api.store.asSubject(id).filter((t) => t.predicate === "HeardAs").map((t) => kinds(t.expr.args[0].value.head)));
    const best = listener
      .map((c) => ({ c, score: kinds(c).filter((k) => mine.includes(k)).length * 10 + suffix(c.toLowerCase(), word.toLowerCase()) }))
      .sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 10 ? best.c.toLowerCase() : undefined;
  };
  const strongest = parts.filter((x) => x.words.some((w) => !w.tags.includes("Emoticon"))).sort((a, b) => b.strength - a.strength)[0];
  let told = "";
  // Said of the one spoken to ("i love you", "you're useless"): about Napkin, answered as such.
  const aboutListener = strongest ? strongest.words.some((w) => refersTo(w.text.charAt(0).toUpperCase() + w.text.slice(1).toLowerCase()) === "Self") : false;
  if (strongest) {
    const out = [];
    let subject = false;
    for (const w of strongest.words) {
      if (w.tags.includes("Emoticon")) continue;
      const word = w.text;
      const other = swapped(word);
      // What agrees with the one now spoken of: "I am" is "you are", "I was" "you were".
      if (subject && w.tags.includes("Copula")) out.push(word === "am" ? "are" : word === "was" ? "were" : word);
      else out.push(other ?? (w.tags.includes("ProperNoun") ? word : word.toLowerCase()));
      subject = other !== undefined && !w.tags.includes("Possessive");
    }
    told = out.join(" ").replace(/\s+([,.!?;:])/g, "$1").replace(/[.!?]+$/, "").trim();
  }
  const out = [];
  if (felt) out.push({ name: "valence", value: Math.round((sum / Math.sqrt(sum * sum + 15)) * 100) / 100 });
  if (felt && told) out.push({ name: "told", value: told });
  if (felt && aboutListener) out.push({ name: "about", value: api.call("Self") });
  
  if (event) {
    const by = {};
    const unit = api.store.get(event);
    for (const r of unit ? unit.relations : []) {
      const claim = r.claim;
      if (r.context !== undefined || !claim || !claim.head || !claim.args.length) continue;
      const target = claim.args[0].value;
      if (!target || typeof target !== "object" || !target.head) continue;
      (by[claim.head] = by[claim.head] || []).push(api.call(target.head));
    }
    const names = { Causes: "causes", CausesDesire: "wants", HasSubevent: "involves", HasFirstSubevent: "involves", HasLastSubevent: "involves", HasPrerequisite: "needs", MotivatedByGoal: "for", Entails: "causes" };
    const lists = {};
    for (const [head, items] of Object.entries(by)) {
      const name = names[head];
      if (!name) continue;
      (lists[name] = lists[name] || []).push(...items);
    }
    if (Object.keys(lists).length) {
      out.unshift({ value: api.call(event) });
      for (const [name, items] of Object.entries(lists)) out.push({ name, value: api.call("List", ...items) });
    }
  }
  return out.length ? { head: "Follows", args: out } : api.call("Follows");
};
