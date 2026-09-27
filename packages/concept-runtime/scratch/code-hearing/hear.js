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
  const first = (identity, head) => {
    const c = claims(identity, head)[0];
    return c && c.args.length ? c.args[0].value : c ? true : undefined;
  };
  // How the language lays its text out: comments, indentation, templates, regular expressions.
  const comments = claims(language.head, "Comments").flatMap((c) => c.args.map((a) => a.value));
  const offside = claims(language.head, "Offside").length > 0;
  const templates = first(language.head, "Templates");
  const regex = claims(language.head, "RegexLiterals").length > 0;
  const stringPrefixes = claims(language.head, "StringPrefixes").length > 0;
  // A symbol is the word the graph says it spells: "+" is Plus.
  const spelled = new Map();
  for (const unit of api.store.all()) {
    for (const r of unit.relations) {
      if (!isCall(r.claim) || r.claim.head !== "Spelled" || !holds(r)) continue;
      const s = r.claim.args[0].value;
      if (!spelled.has(s) || r.context !== undefined) spelled.set(s, unit.identity);
    }
  }
  // Where a "/" may begin a regular expression after a name: after the language's words that
  // lead or join ("return /x/").
  const leading = [];
  for (const unit of api.store.all()) {
    if (unit.relations.some((r) => isCall(r.claim) && r.claim.head === "Keyword" && holds(r))) leading.push(unit.identity[0].toLowerCase() + unit.identity.slice(1));
  }
  const said = api.codeWords(text, { spellings: [...spelled.keys()], comments, offside, templates, regex: regex, regexAfter: leading, stringPrefixes });
  const n = said.length;
  // A name is its Concept ("print" is Print); layout is a word too (Newline, Indent, Dedent).
  const upper = (t) => t[0].toUpperCase() + t.slice(1);
  const LAYOUT = { newline: "Newline", indent: "Indent", dedent: "Dedent", template: "Template", "template-end": "TemplateEnd" };
  const heads = said.map((w) => (w.kind === "name" ? upper(w.text) : w.kind === "symbol" ? spelled.get(w.text) : LAYOUT[w.kind]));
  // What the graph knows a word is, as code, here: its kinds.
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
        for (const k of claims(id, "IsA").map((c) => c.args[0].value)) {
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
  const SHAPE = { name: "Name", number: "Number", text: "Text", comment: "Comment", regex: "Regex" };
  // A name is a word of the language only where the language says it is one (Keyword):
  // "comma" and "not" are names in TypeScript, "not" a word in Python.
  const keyword = (head) => claims(head || "", "Keyword").length > 0;
  const kinds = said.map((w, i) => [SHAPE[w.kind] ?? "Symbol", ...(w.kind !== "name" || keyword(heads[i]) ? kindsOf(heads[i]) : [])]);
  const is = (i, k) => i >= 0 && i < n && kinds[i].includes(k);
  // What a word says it is here (Sense): "<" after a name is its angles, "{" after a signature
  // is a block, "get" in "x.get" is only a name. Its Concept, with only the kinds it has.
  const become = (i, head) => {
    if (head === "Name") kinds[i] = ["Name"];
    else {
      heads[i] = head;
      kinds[i] = [SHAPE[said[i].kind] ?? "Symbol", ...kindsOf(head)];
    }
  };
  // Which brackets pair and which bracket each word is inside, from the links that say what
  // closes what (Closes).
  const pair = said.map(() => -1);
  const inside = said.map(() => -1);
  let links = [];
  // What closes what is a pairing, not a link: who the closer belongs to is the bracket's to say.
  const closed = [];
  const structure = () => {
    pair.fill(-1);
    inside.fill(-1);
    for (const l of closed) {
      pair[l.from] = l.to;
      pair[l.to] = l.from;
    }
    const open = [];
    for (let i = 0; i < n; i++) {
      if (pair[i] >= 0 && pair[i] < i) {
        while (open.length && open[open.length - 1] !== pair[i]) open.pop();
        open.pop();
        inside[i] = open.length ? open[open.length - 1] : -1;
        continue;
      }
      inside[i] = open.length ? open[open.length - 1] : -1;
      if (pair[i] > i) open.push(i);
    }
  };
  const bindsOf = new Map();
  const wordAt = (w, i) => {
    const tags = kinds[i].map((k) => api.call(k));
    if (!bindsOf.has(heads[i])) bindsOf.set(heads[i], [claims(heads[i] || "", "Binds")[0], claims(heads[i] || "", "BindsAfter")[0]]);
    const [binds, after] = bindsOf.get(heads[i]);
    if (binds) tags.push(binds);
    if (after) tags.push(after);
    if (pair[i] >= 0) tags.push(api.call("Pairs", pair[i]));
    if (inside[i] >= 0) tags.push(api.call("Inside", inside[i]));
    if (heads[i]) tags.push(api.call("Heard", api.call(heads[i])));
    return api.call("Word", w.text, i, api.call("List", ...tags));
  };
  // First, what each word is here. A word says it (Sense, about itself only: "<" after a name
  // is its angles, "{" after a signature a block, "x.get"'s "get" only a name), and a bracket
  // finds what closes it (Closes), each as its Concept does under Sensing(Code(<language>)).
  // A word with nothing to say answers with itself and is not asked again. Rounds until no
  // word says anything new.
  const sensing = api.call("Sensing", code);
  const onlyName = (i) => kinds[i].length === 1 && kinds[i][0] === "Name";
  const parent = new Array(n).fill(-1);
  const promptCell = api.cells.allocate(api.call("List"));
  const linksCell = api.cells.allocate(api.call("List"));
  const viewCell = api.cells.allocate(api.call("List"));
  const writeLinks = () => api.cells.write(linksCell, api.call("List", ...links.map((l) => api.call("Link", l.from, l.to, api.call(l.role)))));
  let asking = said.map((_, i) => i).filter((i) => heads[i] && !onlyName(i));
  let rounds = 0;
  for (let round = 0; round < 12 && asking.length; round++) {
    rounds++;
    structure();
    api.cells.write(promptCell, api.call("Prompt", ...said.map(wordAt)));
    writeLinks();
    api.cells.write(viewCell, await api.evaluate(api.call("CodeView", promptCell, linksCell), hearing));
    const still = [];
    let news = 0;
    const closes = [];
    for (const i of asking) {
      if (pair[i] >= 0 && pair[i] < i) continue;
      const said2 = await api.evaluate(api.call(heads[i], promptCell, i, linksCell, viewCell), sensing);
      if (!isCall(said2) || said2.head !== "List") continue;
      still.push(i);
      for (const a of said2.args) {
        const p = a.value;
        if (isCall(p) && p.head === "Link" && p.args[2].value.head === "Closes") closes.push({ from: p.args[0].value, to: p.args[1].value, role: "Closes" });
        else if (isCall(p) && p.head === "Sense" && p.args[0].value === i && isCall(p.args[1].value)) {
          const h2 = p.args[1].value.head;
          if (h2 === "Name" ? onlyName(i) : heads[i] === h2) continue;
          become(i, h2);
          news++;
        }
      }
    }
    for (const c of closes) {
      if (pair[c.from] >= 0 || pair[c.to] >= 0 || c.from === c.to) continue;
      pair[c.to] = c.from;
      pair[c.from] = c.to;
      closed.push(c);
      news++;
    }
    if (!news) break;
    asking = still.filter((i) => !onlyName(i));
  }
  structure();
  // Then the links: rounds until nothing changes. Each word hears as its Concept does under
  // Hearing(Code(<language>)) and answers with the links it proposes. What each word sees
  // (CodeView: the kinds around it and the groups the links have made) is worked out once a
  // round, held in a cell, and handed over by reference, so a word's hearing costs what it
  // looks at, not the length of the code. A word with no hearing of its own (it answered with
  // itself) is not asked again, and a word is asked again only where a link was just made:
  // beside a group whose edges moved, or in a bracket that just gained one.
  api.cells.write(promptCell, api.call("Prompt", ...said.map(wordAt)));
  const RANK = { Absorbs: 1, Takes: 2 };
  const deaf = new Set();
  let dirty = new Set(said.map((_, i) => i));
  const lo = [...Array(n).keys()];
  const hi = [...Array(n).keys()];
  for (let round = 0; round < n + 2 && dirty.size; round++) {
    rounds++;
    writeLinks();
    api.cells.write(viewCell, await api.evaluate(api.call("CodeView", promptCell, linksCell), hearing));
    const proposals = [];
    for (const i of [...dirty].sort((a, b) => a - b)) {
      // A word that closes a bracket is part of how the bracket is said.
      if (!heads[i] || deaf.has(i) || onlyName(i) || (pair[i] >= 0 && pair[i] < i)) continue;
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
        if (pair[hi[k] + 1] >= 0) touch(pair[hi[k] + 1]);
        if (lo[k] > 0 && pair[lo[k] - 1] >= 0) touch(pair[lo[k] - 1]);
        if (lo[k] > 0 && parent[lo[k] - 1] >= 0) touch(parent[lo[k] - 1]);
        // What goes on from it past a separator ("...; else").
        for (let j = hi[k] + 1; j < n && j <= hi[k] + 3; j++) {
          touch(j);
          if (!kinds[j].includes("Separator")) break;
        }
      }
    }
    links = links.concat(accepted);
    dirty = next;
  }
  // Each word written as its Concept, the words it took as its arguments, in the order said.
  // A name keeps how it was typed when its Concept's name does not say it: MyClass(said="MyClass");
  // an operator said after the one thing it holds says so: Increment(X(), after=true).
  const children = said.map(() => []);
  for (const l of [...links].sort((a, b) => a.from - b.from)) {
    if (l.role !== "Absorbs") children[l.to].push(l.from);
  }
  const lower = (t) => t[0].toLowerCase() + t.slice(1);
  const build = (i) => {
    const kids = children[i].map((j) => ({ value: build(j) }));
    const w = said[i];
    if (w.kind === "number") return String(Number(w.text)) === w.text ? Number(w.text) : api.call("Numeral", w.text);
    if (w.kind === "text") return w.value;
    if (w.kind === "regex") return api.call("Regex", w.value, w.flags);
    if (w.kind === "comment") return api.call("Comment", w.value);
    if (!heads[i]) return api.call("Symbol", w.text);
    // A name that is a word of code elsewhere ("index", "comma") says it is only a name here.
    if (w.kind === "name" && (lower(heads[i]) !== w.text || (kinds[i].length === 1 && kindsOf(heads[i]).length > 0))) kids.push({ name: "said", value: w.text });
    if ((is(i, "Infix") || is(i, "Prefix")) && children[i].length === 1 && children[i][0] < i) kids.push({ name: "after", value: true });
    return { head: is(i, "Scope") ? "Block" : heads[i], args: kids };
  };
  // What stands alone is heard; punctuation nobody took adds nothing.
  const PUNCTUATION = ["Closer", "Separator"];
  const roots = [];
  for (let i = 0; i < n; i++) {
    if (parent[i] < 0 && !PUNCTUATION.some((k) => kinds[i].includes(k))) roots.push({ value: build(i) });
  }
  return { head: "Phrases", args: [...roots, { name: "rounds", value: rounds }] };
}
