async (args, bindings, api) => {
  // A "{" where a thing can start is a value; where a statement starts, or after what a block
  // follows, a block. Where indentation makes blocks, a brace is always a value. It decides once
  // the brackets before it have closed (its own closer found, a round later).
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const at = self.args[1].value;
  const words = api.cells.read(self.args[0].value).args;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value.args;
  // An entry that changes as links are made is a cell: read what it holds now.
  const v = (k, i) => {
    if (!(i >= 0 && i < field[k].length)) return undefined;
    const x = field[k][i].value;
    return x !== null && typeof x === "object" && x.head === "CellRef" ? api.cells.read(x) : x;
  };
  const n = field.kinds.length;
  const is = (i, k) => i >= 0 && i < n && v("kinds", i).args.some((a) => a.value === k);
  const text = (i) => (i >= 0 && i < n ? words[i].value.args[0].value : "");
  const head = (i) => v("heads", i);
  const pair = (i) => (v("pair", i) === undefined ? -1 : v("pair", i));
  // As the kind of word it also is: what it does when it is not the case here.
  const as = (kind) => api.evaluate({ head: kind, args: self.args }, api.context);
  const sense = (h) => api.call("List", api.call("Sense", at, api.call(h)));
  // A thing ends here: a name that is no operator, a value, a closed bracket.
  const ends = (i) =>
    (is(i, "Name") && !is(i, "Infix") && !is(i, "Prefix")) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Closer") && head(i) !== "Dedent" && head(i) !== null && !is(pair(i), "Infix"));
  // Round brackets that head a statement: "if (x)".
  const header = (i) => is(i, "Closer") && pair(i) > 0 && is(pair(i) - 1, "Heads");
  if (pair(at) < 0) return api.call("List", api.call("Waits"), ...(await as("Opener")).args.map((a) => a.value));
  const code = (api.context.args ?? []).map((a) => a.value).find((f) => isCall(f) && f.head === "Code");
  const language = code ? api.store.get(code.args[0].value.head) : undefined;
  const offside = !!language && language.relations.some((r) => isCall(r.claim) && r.claim.head === "Offside");
  const returns = (j) => head(j) === "Returns";
  const blockAt = () => {
    if (offside) return false;
    const p = at - 1;
    if (p < 0) return true;
    if (is(p, "TakesBlock")) return true;
    if (is(p, "Separator")) return v("inside", p) === undefined || v("inside", p) < 0 || is(v("inside", p), "Scope") || head(p) === "Semicolon";
    if (is(p, "Opener")) return is(p, "Scope");
    // After a signature's type ("f(): string[] {", "(): void {"), the block the type is of;
    // right after the colon, the brace is the type itself ("(): { a: T } {").
    if (returns(p)) return false;
    for (let j = p; j >= 0; j = is(j, "Closer") && pair(j) >= 0 ? pair(j) - 1 : j - 1) {
      if (returns(j)) return true;
      if (is(j, "Separator") || is(j, "Scope") || (is(j, "Opener") && !(pair(j) >= 0 && pair(j) < at)) || head(j) === "Arrow" || head(j) === "Assign") break;
    }
    // After round brackets, a block, or angles ("f(x) {", "} {", "A<T> {"): a block.
    if (is(p, "Closer")) return pair(p) >= 0 && (is(pair(p), "Round") || is(pair(p), "Scope") || is(pair(p), "Attached"));
    return ends(p) || is(p, "Comment");
  };
  return blockAt() ? sense("Block") : api.call("List");
}