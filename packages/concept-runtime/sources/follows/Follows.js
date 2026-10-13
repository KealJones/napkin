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
  for (const [i, w] of ws.entries()) {
    let v = valence(w.text);
    if (v === undefined && w.typed) v = valence(w.typed);
    if (v === undefined) continue;
    felt = true;
    const turned = ws.slice(Math.max(0, i - 3), i).some((x) => x.tags.includes("Negative"));
    sum += turned ? v * -0.74 : v;
  }
  const out = [];
  if (felt) out.push({ name: "valence", value: Math.round((sum / Math.sqrt(sum * sum + 15)) * 100) / 100 });
  const event = api.ambient("follows");
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
