async (args, bindings, api) => {
  // A bracket groups what it holds. After a name, the group is what the name takes
  // ("print(x)", "for (...)"); a block belongs to the word that leads what is said before it
  // ("for ... { }", "if ...:" and its indented lines). A group nobody takes is its one thing
  // ("(a + b)"). The brackets and separators are part of how it is said: absorbed.
  const self = bindings.get("word");
  const [prompt, at, links] = self.args.map((a) => a.value);
  const v = api.toHost(await api.evaluate(api.call("CodeView", prompt, links), api.context));
  const close = v.pair[at];
  if (close < 0) return api.call("List");
  const named = at > 0 && v.kinds[at - 1].includes("Name") && !v.infix[at - 1];
  const owner = v.block[at] ? v.leader[at] : named ? at - 1 : -1;
  // The parts between separators; a comment is a part of its own. A separator that
  // introduces a block (Python's ":") is inside a part, not between two.
  const parts = [];
  const separators = [];
  let a = at + 1;
  for (let k = at + 1; k <= close; k++) {
    const own = v.inside[k] === at;
    const comment = own && v.kinds[k].includes("Comment");
    const separates = own && v.kinds[k].includes("Separator") && !v.block[k + 1];
    if (k === close || separates || comment) {
      if (k > a) parts.push([a, k]);
      if (comment) parts.push([k, k + 1]);
      else if (k < close) separators.push(k);
      a = k + 1;
    }
  }
  const tops = parts.map(([x, y]) => {
    const found = new Set();
    for (let k = x; k < y; k++) {
      if (v.kinds[k].includes("Separator") && v.parent[k] < 0) continue;
      let t = k;
      while (v.parent[t] >= x && v.parent[t] < y) t = v.parent[t];
      found.add(t);
    }
    return [...found];
  });
  const out = [];
  const link = (from, to, role) => {
    if (v.parent[from] < 0) out.push(api.call("Link", from, to, api.call(role)));
  };
  if (owner >= 0) {
    link(at, owner, "Absorbs");
    link(close, owner, "Absorbs");
    for (const s of separators) link(s, owner, "Absorbs");
    if (tops.every((t) => t.length === 1)) for (const t of tops) link(t[0], owner, "Takes");
  } else if (!v.block[at] && tops.length === 1 && tops[0].length === 1) {
    link(at, tops[0][0], "Absorbs");
    link(close, tops[0][0], "Absorbs");
  }
  return api.call("List", ...out);
}
