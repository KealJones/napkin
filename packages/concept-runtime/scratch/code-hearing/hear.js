async (args, bindings, api) => {
  // Code heard as a message is: each word is its own Concept, and the words find each other in
  // rounds. The language is the context (Code(Python())), so a word hears as it does there.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const text = String(api.toHost(args[0].value));
  const facets = isCall(api.context) && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  const code = facets.find((f) => isCall(f) && f.head === "Code");
  const language = code.args[0].value;
  const hearing = api.call("Hearing", code);
  const same = (a, b) => api.format(a) === api.format(b);
  // A relation holds here when it holds everywhere or in this language; this language's wins.
  const holds = (r) => r.context === undefined || same(r.context, code);
  const claims = (identity, head) => {
    const unit = api.store.get(identity);
    const found = unit ? unit.relations.filter((r) => isCall(r.claim) && r.claim.head === head && holds(r)) : [];
    return [...found.filter((r) => r.context !== undefined), ...found.filter((r) => r.context === undefined)].map((r) => r.claim);
  };
  // How the language lays its text out: what starts a comment, whether indentation is structure.
  const comments = claims(language.head, "Comments").flatMap((c) => c.args.map((a) => a.value));
  const offside = claims(language.head, "Offside").length > 0;
  // A symbol is the word the graph says it spells: "+" is Plus.
  const spelled = new Map();
  for (const unit of api.store.all()) {
    for (const r of unit.relations) {
      if (!isCall(r.claim) || r.claim.head !== "Spelled" || !holds(r)) continue;
      const s = r.claim.args[0].value;
      if (!spelled.has(s) || r.context !== undefined) spelled.set(s, unit.identity);
    }
  }
  const said = api.codeWords(text, { spellings: [...spelled.keys()], comments, offside });
  // A name is its Concept ("print" is Print); layout is a word too (Newline, Indent, Dedent).
  const upper = (t) => t[0].toUpperCase() + t.slice(1);
  const LAYOUT = { newline: "Newline", indent: "Indent", dedent: "Dedent" };
  const heads = said.map((w) => (w.kind === "name" ? upper(w.text) : w.kind === "symbol" ? spelled.get(w.text) : LAYOUT[w.kind]));
  // What the graph knows a word is, as code: its kinds, and how tightly it binds.
  const kindsOf = (head) => {
    const out = [];
    const seen = new Set();
    let frontier = head ? [head] : [];
    while (frontier.length && seen.size < 32) {
      const next = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const unit = api.store.get(id);
        for (const r of unit ? unit.relations : []) {
          const k = isCall(r.claim) && r.claim.head === "IsA" ? r.claim.args[0].value : undefined;
          if (!isCall(k)) continue;
          if (claims(k.head, "IsA").some((x) => isCall(x.args[0].value) && x.args[0].value.head === "CodeWord")) out.push(k.head);
          next.push(k.head);
        }
      }
      frontier = next;
    }
    return out;
  };
  const SHAPE = { name: "Name", number: "Number", text: "Text", comment: "Comment", symbol: "Symbol", newline: "Symbol", indent: "Symbol", dedent: "Symbol" };
  const kinds = said.map((w, i) => [SHAPE[w.kind], ...kindsOf(heads[i])]);
  // Brackets pair by counting, as any bracket is read; each word knows the bracket it is inside.
  const pair = said.map(() => -1);
  const inside = said.map(() => -1);
  const open = [];
  for (let i = 0; i < said.length; i++) {
    inside[i] = open.length ? open[open.length - 1] : -1;
    if (kinds[i].includes("Closer") && open.length) {
      const o = open.pop();
      pair[o] = i;
      pair[i] = o;
      inside[i] = open.length ? open[open.length - 1] : -1;
    }
    if (kinds[i].includes("Opener")) open.push(i);
  }
  const words = said.map((w, i) => {
    const tags = kinds[i].map((k) => api.call(k));
    const binds = claims(heads[i] || "", "Binds")[0];
    if (binds) tags.push(binds);
    if (pair[i] >= 0) tags.push(api.call("Pairs", pair[i]));
    if (inside[i] >= 0) tags.push(api.call("Inside", inside[i]));
    return api.call("Word", w.text, i, api.call("List", ...tags));
  });
  const prompt = api.call("Prompt", ...words);
  // Rounds until nothing changes: every word hears, proposals settle, one parent per word.
  let links = [];
  const linked = () => api.call("List", ...links.map((l) => api.call("Link", l.from, l.to, api.call(l.role))));
  const RANK = { Absorbs: 1, Takes: 2 };
  for (let round = 0; round < said.length + 2; round++) {
    const current = linked();
    const proposals = [];
    for (let i = 0; i < said.length; i++) {
      if (!heads[i]) continue;
      const proposed = await api.evaluate(api.call(heads[i], prompt, i, current), hearing);
      if (!isCall(proposed) || proposed.head !== "List") continue;
      for (const a of proposed.args) {
        const p = a.value;
        if (!isCall(p) || p.head !== "Link") continue;
        proposals.push({ from: p.args[0].value, to: p.args[1].value, role: p.args[2].value.head });
      }
    }
    proposals.sort((a, b) => (RANK[a.role] ?? 3) - (RANK[b.role] ?? 3));
    const up = new Map(links.map((l) => [l.from, l.to]));
    const above = (i, j) => {
      for (let k = i, n = 0; k !== undefined && n < 512; k = up.get(k), n++) {
        if (k === j) return true;
      }
      return false;
    };
    const accepted = [];
    for (const p of proposals) {
      if (up.has(p.from) || p.from === p.to || above(p.to, p.from)) continue;
      accepted.push(p);
      up.set(p.from, p.to);
    }
    if (!accepted.length) break;
    links = links.concat(accepted);
  }
  // Each word written as its Concept, the words it took as its arguments, in the order said.
  // A name keeps how it was typed when its Concept's name does not say it: MyClass(said="MyClass").
  const parentOf = new Map(links.map((l) => [l.from, l]));
  const lower = (t) => t[0].toLowerCase() + t.slice(1);
  const build = (i) => {
    const kids = [];
    for (let j = 0; j < said.length; j++) {
      const l = parentOf.get(j);
      if (l && l.to === i && l.role !== "Absorbs") kids.push({ value: build(j) });
    }
    const w = said[i];
    if (w.kind === "number") return String(Number(w.text)) === w.text ? Number(w.text) : api.call("Number", w.text);
    if (w.kind === "text") return w.value;
    if (w.kind === "comment") return api.call("Comment", w.value);
    if (!heads[i]) return api.call("Symbol", w.text);
    if (w.kind === "name" && lower(heads[i]) !== w.text) kids.push({ name: "said", value: w.text });
    return { head: heads[i], args: kids };
  };
  // What stands alone is heard; punctuation nobody took adds nothing.
  const PUNCTUATION = ["Opener", "Closer", "Separator"];
  const roots = [];
  for (let i = 0; i < said.length; i++) {
    if (!parentOf.has(i) && !PUNCTUATION.some((k) => kinds[i].includes(k))) roots.push(build(i));
  }
  return api.call("Phrases", ...roots);
}
