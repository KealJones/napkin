// The names code binds, as heard, so reading can tell the program's own variables from names it
// only uses. The words say how they bind: a word that Declares binds what it holds (const, let,
// import, catch); one that DeclaresFirst binds only its first part (a loop's binding, an
// assignment's target); one that DeclaresName binds the name it holds and what
// that name takes (a function, a class); one that DeclaresParameters binds what it is given (an
// arrow). BindsLeft and BindsRight say which side of a pair is the bound one ("x = 1", "a as b").
const claims = (e) => (isCall(e) ? api.store.get(e.head)?.relations ?? [] : []);
const holds = (e, claim) => claims(e).some((r) => is(r.claim, claim));
const isa = (e, kind) => claims(e).some((r) => is(r.claim, "IsA") && is(r.claim.args[0].value, kind));
const names = new Set();
// A pattern of names: a name, or brackets of them; a default or a type beside it is not bound.
const bind = (e) => {
  if (is(e, "Identifier")) names.add(nameOf(e));
  else if (holds(e, "BindsLeft")) bind(positional(e)[0]);
  else if (holds(e, "BindsRight")) bind(positional(e)[1]);
  else if (isa(e, "Opener") || is(e, "Spread") || holds(e, "Declares")) for (const x of positional(e)) bind(x);
};
const takes = (e) => {
  names.add(nameOf(e));
  for (const x of positional(e)) if (!is(x, "Block")) bind(x);
};
const walk = (e) => {
  if (!isCall(e)) return;
  const p = positional(e);
  if (holds(e, "Declares")) p.forEach(bind);
  else if (holds(e, "DeclaresFirst")) bind(p[0]);
  else if (holds(e, "DeclaresName") && is(p[0], "Identifier")) takes(p[0]);
  else if (holds(e, "DeclaresParameters")) bind(p[0]);
  // A method in a class or an object: what it takes.
  if (is(e, "Identifier") && p.some((x) => is(x, "Block"))) takes(e);
  for (const x of p) walk(x);
};
for (const s of parts) walk(s);
return api.call("List", ...[...names]);
