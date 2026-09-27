async (args, bindings, api) => {
  // What a word hearing code needs to see: what each word is, and what the links so far make
  // of the words around it (where each group of words starts and ends).
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const words = api.cells.read(args[0].value).args.map((a) => a.value);
  const n = words.length;
  const kinds = [];
  const binds = [];
  const right = [];
  const pair = [];
  const inside = [];
  const leader = [];
  const tagged = (tags, head) => {
    const t = tags.find((x) => isCall(x) && x.head === head);
    return t ? t.args[0].value : -1;
  };
  for (const w of words) {
    const tags = w.args[2].value.args.map((a) => a.value);
    kinds.push(tags.filter((t) => isCall(t) && t.args.length === 0).map((t) => t.head));
    const b = tags.find((t) => isCall(t) && t.head === "Binds");
    binds.push(b ? b.args[0].value : null);
    right.push(b ? b.args.length > 1 : false);
    pair.push(tagged(tags, "Pairs"));
    inside.push(tagged(tags, "Inside"));
    leader.push(tagged(tags, "Leader"));
  }
  const is = (i, k) => i >= 0 && i < n && kinds[i].includes(k);
  const scope = kinds.map((_, i) => is(i, "Scope"));
  const infix = kinds.map((_, i) => is(i, "Infix"));
  const prefix = kinds.map((_, i) => is(i, "Prefix"));
  // What binds as an operator does, for what waits on it: operators, and an index after a thing.
  const operator = kinds.map((_, i) => infix[i] || is(i, "Postfix"));
  // A block after an operator is the operator's thing: it stands alone, as a value does.
  const alone = kinds.map((_, i) => scope[i] && leader[i] < 0 && infix[i - 1]);
  // A thing can end here: a name that is not an operator, a value, a closed group (not a block).
  // A closed group ends a thing, but not a block, a header ("if (x)"), or a question's ":".
  const plainEnd = (i) =>
    (is(i, "Name") && !infix[i] && !prefix[i]) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Closer") && (!scope[pair[i]] || alone[pair[i]]) && !is(pair[i] - 1, "Heads") && !infix[pair[i]]);
  // An operator that cannot stand alone, found where a thing should be, is a thing ("import *");
  // a word that joins, found where a thing should be, is only a name ("(from: number)").
  const symbolStray = kinds.map((_, i) => infix[i] && !is(i, "Unary") && !prefix[i] && !is(i, "Name") && i > 0 && !plainEnd(i - 1) && !infix[i - 1]);
  const stray = kinds.map((_, i) => symbolStray[i] || (infix[i] && is(i, "Name") && !is(i, "Unary") && !prefix[i] && !plainEnd(i - 1) && !symbolStray[i - 1]));
  const ends = (i) => plainEnd(i) || !!stray[i];
  // A thing can start here: a name, a value, a group, an operator standing alone.
  const attached = (i) => is(i, "Postfix") || is(i, "Attached");
  const starts = (i, lone) => stray[i] || (is(i, "Name") && !infix[i]) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Opener") && !scope[i] && !attached(i) && !infix[i]) || alone[i] || lone(i);
  // An operator with a thing before it and none after holds only that thing ("x++", "x!"),
  // and ends a thing itself; one with nothing before it holds only what follows ("-x").
  // Only a word that can stand before a thing alone (Unary: "-", "!", "++") does.
  const lone = (i) => infix[i] && (is(i, "Unary") || prefix[i]);
  const firstUnary = (i) => lone(i) && !ends(i - 1);
  const postfix = kinds.map((_, i) => infix[i] && !stray[i] && ends(i - 1) && !starts(i + 1, firstUnary));
  const operandEnd = kinds.map((_, i) => ends(i) || postfix[i]);
  const unary = kinds.map((_, i) => lone(i) && !operandEnd[i - 1]);
  const operandStart = kinds.map((_, i) => starts(i, (k) => unary[k]));
  // Where what is being said stops: a separator, a closer, a block, a comment, the end.
  const boundary = [...kinds.map((_, i) => is(i, "Separator") || is(i, "Closer") || (scope[i] && !alone[i]) || is(i, "Comment")), true];
  const punctuation = kinds.map((_, i) => is(i, "Separator") || is(i, "Closer"));
  const parent = new Array(n).fill(-1);
  const role = new Array(n).fill("");
  for (const l of api.cells.read(args[1].value).args) {
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
  return api.fromHost({ operator, stray, kinds, binds, right, pair, inside, leader, scope, alone, infix, prefix, unary, postfix, operandEnd, operandStart, boundary, punctuation, parent, role, lo, hi });
}
