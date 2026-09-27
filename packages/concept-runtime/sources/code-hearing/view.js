async (args, bindings, api) => {
  // What a word hearing code needs to see: what each word is, and what the links so far make
  // of the words around it (where each group of words starts and ends).
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  // Reads what each word is from the view hear.js keeps (each field a list, one entry a word),
  // and gives it back with what that makes of the words around each added.
  const view = api.cells.read(args[0].value);
  const field = {};
  for (const a of view.args) field[a.name] = api.lists.values(a.value);
  const n = field.heads.length;
  const kinds = field.kinds.map((k) => k.args.map((a) => a.value));
  const { binds, after, right, pair, inside } = field;
  // The words whose kinds this changes, and only those, get a new list of kinds.
  const changed = new Map();
  // A word that closes a bracket ("a ? b : c", "A<T>") is only that bracket's end.
  for (let i = 0; i < n; i++) {
    if (pair[i] >= 0 && pair[i] < i && !kinds[i].includes("Closer")) {
      kinds[i] = [...kinds[i].filter((k) => k !== "Infix" && k !== "Separator" && k !== "Prefix"), "Closer"];
      changed.set(i, api.call("List", ...kinds[i]));
    }
  }
  const is = (i, k) => i >= 0 && i < n && kinds[i].includes(k);
  const scope = kinds.map((_, i) => is(i, "Scope"));
  const infix = kinds.map((_, i) => is(i, "Infix"));
  const prefix = kinds.map((_, i) => is(i, "Prefix"));
  // What binds as an operator does, for what waits on it: operators, and an index after a thing.
  // A block after an operator is the operator's thing: it stands alone, as a value does.
  const alone = kinds.map((_, i) => scope[i] && infix[i - 1]);
  // A thing can end here: a name that is not an operator, a value, a closed group (not a block).
  // A closed group ends a thing, but not a block, a header ("if (x)"), or a question's ":".
  const plainEnd = (i) =>
    (is(i, "Name") && !infix[i] && !prefix[i]) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Closer") && (!scope[pair[i]] || alone[pair[i]]) && !is(pair[i] - 1, "Heads") && !infix[pair[i]]);
  // An operator that cannot stand alone, found where a thing should be, is a thing ("import *");
  // a word that joins, found where a thing should be, is only a name ("(from: number)").
  // (nothing after it to hold either: "import * as", but not "(): void =>").
  const nothingAfter = (i) => !(is(i + 1, "Name") && !infix[i + 1]) && !is(i + 1, "Number") && !is(i + 1, "Text") && !is(i + 1, "Regex") && !(is(i + 1, "Opener") && !scope[i + 1]) && !alone[i + 1] && !is(i + 1, "Unary");
  const symbolStray = kinds.map((_, i) => infix[i] && !is(i, "Unary") && !prefix[i] && !is(i, "Name") && i > 0 && !plainEnd(i - 1) && !infix[i - 1] && nothingAfter(i));
  const stray = kinds.map((_, i) => symbolStray[i] || (infix[i] && is(i, "Name") && !is(i, "Unary") && !prefix[i] && !plainEnd(i - 1) && !symbolStray[i - 1]));
  // A leading word with nothing to lead is only a name ("(): void =>", "default:").
  const leads = (i) => prefix[i] && is(i, "Name") && !is(i, "Heads") && !is(i, "TakesBlock") && !is(i, "Continues") && !infix[i];
  const idle = kinds.map((_, i) => leads(i) && i + 1 <= n && !(is(i + 1, "Name") || is(i + 1, "Number") || is(i + 1, "Text") || is(i + 1, "Regex") || (is(i + 1, "Opener") && !scope[i + 1]) || is(i + 1, "Unary") || is(i + 1, "Prefix") || stray[i + 1]));
  const ends = (i) => plainEnd(i) || !!stray[i] || !!idle[i];
  // What binds as an operator does, for what waits on it: operators that are not only names
  // here, and an index after a thing.
  const operator = kinds.map((_, i) => (infix[i] && !stray[i]) || is(i, "Postfix"));
  // A thing can start here: a name, a value, a group, an operator standing alone.
  const attached = (i) => is(i, "Postfix") || is(i, "Attached");
  const starts = (i, lone) => stray[i] || idle[i] || (is(i, "Name") && !infix[i]) || is(i, "Number") || is(i, "Text") || is(i, "Regex") || (is(i, "Opener") && !scope[i] && !attached(i) && !infix[i]) || alone[i] || lone(i);
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
  const made = { operator, stray, scope, alone, infix, prefix, unary, postfix, operandEnd, operandStart, boundary, punctuation };
  const derived = [{ name: "kinds", value: api.lists.with(view.args.find((a) => a.name === "kinds").value, changed) }, ...Object.entries(made).map(([name, xs]) => ({ name, value: api.lists.of(xs.map((x) => api.fromHost(x))) }))];
  const own = new Set(derived.map((a) => a.name));
  return { head: view.head, args: [...view.args.filter((a) => !own.has(a.name)), ...derived] };
}
