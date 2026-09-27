async (args, bindings, api) => {
  // What a word hearing code needs to see: what each word is, and what the links so far make
  // of the words around it (where each group of words starts and ends).
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const words = args[0].value.args.map((a) => a.value);
  const n = words.length;
  const kinds = [];
  const binds = [];
  const right = [];
  const pair = [];
  const inside = [];
  for (const w of words) {
    const tags = w.args[2].value.args.map((a) => a.value);
    kinds.push(tags.filter((t) => isCall(t) && t.args.length === 0).map((t) => t.head));
    const b = tags.find((t) => isCall(t) && t.head === "Binds");
    binds.push(b ? b.args[0].value : null);
    right.push(b ? b.args.length > 1 : false);
    const p = tags.find((t) => isCall(t) && t.head === "Pairs");
    pair.push(p ? p.args[0].value : -1);
    const o = tags.find((t) => isCall(t) && t.head === "Inside");
    inside.push(o ? o.args[0].value : -1);
  }
  const is = (i, k) => i >= 0 && i < n && kinds[i].includes(k);
  const block = kinds.map((_, i) => is(i, "Block"));
  const infix = kinds.map((_, i) => is(i, "Infix"));
  const prefix = kinds.map((_, i) => is(i, "Prefix"));
  // A thing can end here: a name that is not an operator, a value, a closed group (not a block).
  const ends = (i) => (is(i, "Name") && !infix[i] && !prefix[i]) || is(i, "Number") || is(i, "Text") || (is(i, "Closer") && !block[pair[i]]);
  const operandEnd = kinds.map((_, i) => ends(i));
  // An operator with nothing before it to hold holds only what follows: "-x".
  const unary = kinds.map((_, i) => infix[i] && !ends(i - 1));
  // A thing can start here: a name, a value, a group, an operator standing alone.
  const operandStart = kinds.map((_, i) => (is(i, "Name") && !infix[i]) || is(i, "Number") || is(i, "Text") || (is(i, "Opener") && !block[i]) || unary[i]);
  // Where what is being said stops: a separator, a closer, a block, a comment, the end.
  const boundary = [...kinds.map((_, i) => is(i, "Separator") || is(i, "Closer") || block[i] || is(i, "Comment")), true];
  const punctuation = kinds.map((_, i) => is(i, "Separator") || is(i, "Closer") || is(i, "Opener"));
  const parent = new Array(n).fill(-1);
  const role = new Array(n).fill("");
  for (const l of args[1].value.args) {
    const [from, to, r] = l.value.args.map((a) => a.value);
    parent[from] = to;
    role[from] = r.head;
  }
  const lo = [...Array(n).keys()];
  const hi = [...Array(n).keys()];
  for (let i = 0; i < n; i++) {
    for (let p = parent[i], g = 0; p >= 0 && g < n; p = parent[p], g++) {
      lo[p] = Math.min(lo[p], i);
      hi[p] = Math.max(hi[p], i);
    }
  }
  // Who a block belongs to: the word that starts what is said before it, past any group, and
  // past the one separator that introduces the block (Python's ":").
  const leader = new Array(n).fill(-1);
  for (let o = 0; o < n; o++) {
    if (!block[o]) continue;
    let k = o - 1;
    if (is(k, "Separator")) k--;
    while (k >= 0) {
      if (is(k, "Closer") && !block[pair[k]] && pair[k] >= 0) {
        k = pair[k] - 1;
        continue;
      }
      if (is(k, "Separator") || is(k, "Opener") || is(k, "Closer") || is(k, "Comment")) break;
      k--;
    }
    if (k + 1 < o && !punctuation[k + 1]) leader[o] = k + 1;
  }
  return api.fromHost({ kinds, binds, right, pair, inside, block, infix, prefix, unary, operandEnd, operandStart, boundary, punctuation, parent, role, lo, hi, leader });
}
