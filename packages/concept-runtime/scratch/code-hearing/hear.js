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
  const n = said.length;
  // A name is its Concept ("print" is Print); layout is a word too (Newline, Indent, Dedent).
  const upper = (t) => t[0].toUpperCase() + t.slice(1);
  const LAYOUT = { newline: "Newline", indent: "Indent", dedent: "Dedent" };
  const heads = said.map((w) => (w.kind === "name" ? upper(w.text) : w.kind === "symbol" ? spelled.get(w.text) : LAYOUT[w.kind]));
  // What the graph knows a word is, as code: its kinds, and how tightly it binds.
  const known = new Map();
  const kindsOf = (head) => {
    if (known.has(head)) return known.get(head);
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
    known.set(head, out);
    return out;
  };
  const SHAPE = { name: "Name", number: "Number", text: "Text", comment: "Comment", symbol: "Symbol", newline: "Symbol", indent: "Symbol", dedent: "Symbol" };
  const kinds = said.map((w, i) => [SHAPE[w.kind], ...kindsOf(heads[i])]);
  // Brackets pair by counting, as any bracket is read; each word knows the bracket it is inside.
  const pair = said.map(() => -1);
  const inside = said.map(() => -1);
  const open = [];
  for (let i = 0; i < n; i++) {
    inside[i] = open.length ? open[open.length - 1] : -1;
    if (kinds[i].includes("Closer") && open.length) {
      const o = open.pop();
      pair[o] = i;
      pair[i] = o;
      inside[i] = open.length ? open[open.length - 1] : -1;
    }
    if (kinds[i].includes("Opener")) open.push(i);
  }
  const bindsOf = new Map();
  const words = said.map((w, i) => {
    const tags = kinds[i].map((k) => api.call(k));
    if (!bindsOf.has(heads[i])) bindsOf.set(heads[i], claims(heads[i] || "", "Binds")[0]);
    const binds = bindsOf.get(heads[i]);
    if (binds) tags.push(binds);
    if (pair[i] >= 0) tags.push(api.call("Pairs", pair[i]));
    if (inside[i] >= 0) tags.push(api.call("Inside", inside[i]));
    return api.call("Word", w.text, i, api.call("List", ...tags));
  });
  const prompt = api.call("Prompt", ...words);
  // Rounds until nothing changes. What each word sees (CodeView: the kinds around it and the
  // groups the links have made) is worked out once a round, held in a cell, and handed over by
  // reference, so a word's hearing costs what it looks at, not the length of the code. A word
  // with no hearing of its own (it answered with itself) is not asked again, and a word is
  // asked again only where a link was just made: beside a group whose edges moved, or in a
  // bracket that just gained one.
  let links = [];
  const parent = new Array(n).fill(-1);
  const promptCell = api.cells.allocate(prompt);
  const linksCell = api.cells.allocate(api.call("List"));
  const viewCell = api.cells.allocate(api.call("List"));
  const RANK = { Absorbs: 1, Takes: 2 };
  const deaf = new Set();
  let dirty = new Set(said.map((_, i) => i));
  const lo = [...Array(n).keys()];
  const hi = [...Array(n).keys()];
  let rounds = 0;
  for (let round = 0; round < n + 2 && dirty.size; round++) {
    rounds++;
    api.cells.write(linksCell, api.call("List", ...links.map((l) => api.call("Link", l.from, l.to, api.call(l.role)))));
    api.cells.write(viewCell, await api.evaluate(api.call("CodeView", promptCell, linksCell), hearing));
    const proposals = [];
    for (const i of [...dirty].sort((a, b) => a - b)) {
      if (!heads[i] || deaf.has(i)) continue;
      const proposed = await api.evaluate(api.call(heads[i], promptCell, i, linksCell, viewCell), hearing);
      if (!isCall(proposed) || proposed.head !== "List") {
        deaf.add(i);
        continue;
      }
      for (const a of proposed.args) {
        const p = a.value;
        if (!isCall(p) || p.head !== "Link") continue;
        proposals.push({ from: p.args[0].value, to: p.args[1].value, role: p.args[2].value.head });
      }
    }
    proposals.sort((a, b) => (RANK[a.role] ?? 3) - (RANK[b.role] ?? 3));
    const above = (i, j) => {
      for (let k = i, g = 0; k >= 0 && g < n; k = parent[k], g++) {
        if (k === j) return true;
      }
      return false;
    };
    const accepted = [];
    for (const p of proposals) {
      if (parent[p.from] >= 0 || p.from === p.to || above(p.to, p.from)) continue;
      accepted.push(p);
      parent[p.from] = p.to;
    }
    // A waiting word waits on the edges of the groups beside it, or on its bracket's parts.
    const next = new Set();
    const touch = (i) => {
      if (i >= 0 && i < n) next.add(i);
    };
    for (const p of accepted) {
      touch(p.from);
      touch(inside[p.from]);
      for (let k = p.to, g = 0; k >= 0 && g < n; k = parent[k], g++) {
        lo[k] = Math.min(lo[k], lo[p.from]);
        hi[k] = Math.max(hi[k], hi[p.from]);
        touch(k);
        touch(lo[k] - 1);
        touch(hi[k] + 1);
        touch(inside[k]);
      }
    }
    links = links.concat(accepted);
    dirty = next;
  }
  // Each word written as its Concept, the words it took as its arguments, in the order said.
  // A name keeps how it was typed when its Concept's name does not say it: MyClass(said="MyClass").
  const children = said.map(() => []);
  const absorbed = new Set();
  for (const l of [...links].sort((a, b) => a.from - b.from)) {
    if (l.role === "Absorbs") absorbed.add(l.from);
    else children[l.to].push(l.from);
  }
  const lower = (t) => t[0].toLowerCase() + t.slice(1);
  const build = (i) => {
    const kids = children[i].map((j) => ({ value: build(j) }));
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
  for (let i = 0; i < n; i++) {
    if (parent[i] < 0 && !PUNCTUATION.some((k) => kinds[i].includes(k))) roots.push({ value: build(i) });
  }
  return { head: "Phrases", args: [...roots, { name: "rounds", value: rounds }] };
}
