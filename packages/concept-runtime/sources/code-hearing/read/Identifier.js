// A name as written, worked out here, never guessed: a variable where the code binds it
// (InScope, from CodeScope) or the language gives it every program (GlobalName("console") on a
// Concept); else a name this code uses but does not bind, kept as written (UnboundName), for the
// graph to work out once it knows more. What it took, it is called with.
const name = nameOf(self);
const xs = [];
let called = false;
for (const p of parts) {
  if (is(p, "Parens") && p.args.length === 0) called = true;
  else if (!is(p, "Angles") && !is(p, "Comment")) xs.push(await read(p));
}
const facets = is(api.context, "Context") ? positional(api.context) : [api.context];
const scope = facets.find((f) => is(f, "InScope"));
const bound = !!scope && positional(scope).includes(name);
const code = facets.find((f) => is(f, "Code"));
const here = (r) => r.context === undefined || (code !== undefined && api.format(r.context) === api.format(code));
const global = bound ? undefined : api.store.mentioning(name).find((m) => here(m.relation) && is(m.relation.claim, "GlobalName") && m.relation.claim.args[0].value === name);
const target = bound || global ? variable(self) : api.call("UnboundName", name);
return xs.length || called ? api.call("Call", target, ...xs) : target;
