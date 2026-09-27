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
  // A symbol is the word the graph says it spells: "+" is Plus.
  const spelled = new Map();
  for (const unit of api.store.all()) {
    for (const r of unit.relations) {
      if (!isCall(r.claim) || r.claim.head !== "Spelled" || !holds(r)) continue;
      const s = r.claim.args[0].value;
      if (!spelled.has(s) || r.context !== undefined) spelled.set(s, unit.identity);
    }
  }
  const said = api.codeWords(text, { spellings: [...spelled.keys()], comments, offside, templates, regex: regex });
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
  const kinds = said.map((w, i) => [SHAPE[w.kind] ?? "Symbol", ...kindsOf(heads[i])]);
  // A word typed other than as its Concept's plain name ("Set" beside "set"), a member's name
  // ("x.set"), or a key ("{ default: 1 }") is a name, whatever the word is elsewhere.
  for (let i = 0; i < n; i++) {
    const w = said[i];
    if (w.kind !== "name" || kinds[i].length === 1) continue;
    const member = i > 0 && said[i - 1].kind === "symbol" && (said[i - 1].text === "." || said[i - 1].text === "?.");
    const key = i + 1 < n && said[i + 1].kind === "symbol" && said[i + 1].text === ":" && i > 0 && said[i - 1].kind === "symbol" && (said[i - 1].text === "{" || said[i - 1].text === ",");
    if (w.text !== heads[i][0].toLowerCase() + heads[i].slice(1) || member || key) kinds[i] = ["Name"];
  }
  const is = (i, k) => i >= 0 && i < n && kinds[i].includes(k);
  const become = (i, head) => {
    heads[i] = head;
    kinds[i] = [SHAPE[said[i].kind] ?? "Symbol", ...kindsOf(head)];
  };
  // A thing ends here: a name that is no operator, a value, a closed bracket.
  const ends = (i) => (is(i, "Name") && !is(i, "Infix") && !is(i, "Prefix")) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Closer") && !is(i, "Dedent"));
  // Where a bracket stands says which it is. "[" after a thing is that thing's index. "<"
  // right after a name, closing on ">" around nothing that computes, is the name's angles.
  // A "{" where a thing can start is a value; where a statement starts, or after what a
  // block follows, a block. Where indentation makes blocks, a brace is always a value.
  const CALM = new Set([",", ".", "[", "]", "|", "&", "?", ":", "?:", "(", ")", "=>", "{", "}", ";", "...", "<", ">", "\n"]);
  for (let i = 0; i < n; i++) {
    // A colon that opens a block (Python's) only separates the block from what leads it.
    if (heads[i] === "Colon" && is(i + 1, "Scope")) kinds[i] = ["Symbol", "Separator"];
  }
  for (let i = 1; i < n; i++) {
    if (is(i, "Opener") && heads[i] === "Brackets" && ends(i - 1)) become(i, "Index");
    // A colon right after round brackets says what they give: "(x): number".
    if (heads[i] === "Colon" && is(i, "Infix") && said[i - 1].text === ")") become(i, "Returns");
    if (heads[i] === "Less" && is(i - 1, "Name") && !is(i - 1, "Infix")) {
      let depth = 0;
      let j = i;
      for (; j < n && j < i + 200; j++) {
        const t = said[j];
        if (t.kind === "symbol" && t.text === "<") depth++;
        else if (t.kind === "symbol" && t.text === ">") depth--;
        else if (!(t.kind === "name" || t.kind === "text" || t.kind === "number" || (t.kind === "symbol" && CALM.has(t.text)))) break;
        if (depth === 0) break;
      }
      if (depth === 0 && j < n && said[j].text === ">") {
        become(i, "Angles");
        become(j, "AngleEnd");
      }
    }
  }
  // Brackets pair by counting, as any bracket is read; an opener that says what closes it
  // (ClosedBy: "?" by ":", angles by their end) is closed only by that.
  const pair = said.map(() => -1);
  const inside = said.map(() => -1);
  const open = [];
  const closedBy = (i) => first(heads[i] || "", "ClosedBy");
  const blockAt = (i) => {
    if (offside) return false;
    const p = i - 1;
    if (p < 0) return true;
    if (is(p, "TakesBlock")) return true;
    if (is(p, "Separator")) return inside[p] < 0 || is(inside[p], "Scope") || heads[p] === "Semicolon";
    // After round brackets, a block, or angles ("f(x) {", "} {", "A<T> {"): a block.
    if (is(p, "Closer")) return pair[p] >= 0 && (is(pair[p], "Round") || is(pair[p], "Scope") || is(pair[p], "Attached"));
    if (is(p, "Opener")) return is(p, "Scope");
    // After a type ("(): void {"), a brace is the block the type is of.
    if (is(p, "Prefix") && (heads[p - 1] === "Colon" || heads[p - 1] === "Returns")) return true;
    return ends(p) || is(p, "Comment");
  };
  for (let i = 0; i < n; i++) {
    if (heads[i] === "Braces" && blockAt(i)) become(i, "Block");
    inside[i] = open.length ? open[open.length - 1] : -1;
    const top = open.length ? open[open.length - 1] : -1;
    const wanted = top >= 0 ? closedBy(top) : undefined;
    if (wanted && isCall(wanted) && (wanted.head === heads[i] || (wanted.head === "Colon" && heads[i] === "Returns"))) {
      open.pop();
      pair[top] = i;
      pair[i] = top;
      inside[i] = open.length ? open[open.length - 1] : -1;
      kinds[i] = [...kinds[i].filter((k) => k !== "Infix" && k !== "Separator"), "Closer"];
      continue;
    }
    if (is(i, "Closer")) {
      while (open.length && closedBy(open[open.length - 1])) open.pop();
      if (open.length) {
        const o = open.pop();
        pair[o] = i;
        pair[i] = o;
      }
      inside[i] = open.length ? open[open.length - 1] : -1;
    }
    if (is(i, "Opener")) open.push(i);
  }
  // Who a block belongs to: the name whose brackets come just before it (a function, a
  // method; with its return type, that type's colon), else the word that leads what is
  // said before it (if, for, class, else). After an operator it belongs to no one: it is
  // the operator's thing ("=> { }").
  const leader = said.map(() => -1);
  const stops = (k) => is(k, "Separator") || is(k, "Scope") || is(k, "Comment") || (is(k, "Closer") && is(pair[k], "Scope"));
  for (let o = 0; o < n; o++) {
    if (!is(o, "Scope")) continue;
    let p = o - 1;
    if (is(p, "Separator") && offside) p--;
    if (p < 0 || is(p, "Infix")) continue;
    let k = p;
    let typed = -1;
    if (!(is(k, "Closer") && heads[pair[k]] === "Parens")) {
      for (let j = k; j >= 0 && !stops(j); j = is(j, "Closer") && pair[j] >= 0 ? pair[j] - 1 : j - 1) {
        if (is(j, "Opener")) break;
        if (heads[j] === "Returns") {
          typed = j;
          k = j - 1;
          break;
        }
      }
    }
    if (is(k, "Closer") && heads[pair[k]] === "Parens") {
      let g = pair[k] - 1;
      if (is(g, "Closer") && heads[g] === "AngleEnd") g = pair[g] - 1;
      if (is(g, "Name") && !is(g, "Infix")) {
        leader[o] = is(g, "Prefix") ? g : typed >= 0 ? typed : g;
        continue;
      }
    }
    for (let j = p; j >= 0 && !stops(j); j = is(j, "Closer") && pair[j] >= 0 ? pair[j] - 1 : j - 1) {
      if (is(j, "Opener")) break;
      if (is(j, "Prefix")) {
        leader[o] = j;
        break;
      }
    }
  }
  const bindsOf = new Map();
  const words = said.map((w, i) => {
    const tags = kinds[i].map((k) => api.call(k));
    if (!bindsOf.has(heads[i])) bindsOf.set(heads[i], claims(heads[i] || "", "Binds")[0]);
    const binds = bindsOf.get(heads[i]);
    if (binds) tags.push(binds);
    if (pair[i] >= 0) tags.push(api.call("Pairs", pair[i]));
    if (inside[i] >= 0) tags.push(api.call("Inside", inside[i]));
    if (leader[i] >= 0) tags.push(api.call("Leader", leader[i]));
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
        if (pair[hi[k] + 1] >= 0) touch(pair[hi[k] + 1]);
        if (lo[k] > 0 && pair[lo[k] - 1] >= 0) touch(pair[lo[k] - 1]);
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
    if (w.kind === "number") return String(Number(w.text)) === w.text ? Number(w.text) : api.call("Number", w.text);
    if (w.kind === "text") return w.value;
    if (w.kind === "regex") return api.call("Regex", w.value, w.flags);
    if (w.kind === "comment") return api.call("Comment", w.value);
    if (!heads[i]) return api.call("Symbol", w.text);
    if (w.kind === "name" && lower(heads[i]) !== w.text) kids.push({ name: "said", value: w.text });
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
