// "a.name": the member of a by that name; "a.b(c)": that member called. Where the graph says a
// member by that name is a Concept of the code IR in this language ("xs.length" is Length(xs),
// "xs.map(f)" is Map(xs, f)), it reads as that Concept.
const [owner, member] = self.args.filter((a) => a.name === undefined).map((a) => a.value);
// "import.meta": the module's own facts.
if (isCall(owner) && owner.head === "Import" && owner.args.every((a) => a.name !== undefined) && isCall(member) && member.head === "Meta") return api.call("ImportMeta");
const of = await api.evaluate(owner, api.context);
if (!isCall(member)) return api.call("Member", of, member);
const said = member.args.find((a) => a.name === "said");
const name = said ? said.value : member.head[0].toLowerCase() + member.head.slice(1);
const got = api.call("Member", of, name);
const values = [];
let called = false;
for (const a of member.args) {
  if (a.name !== undefined) continue;
  if (isCall(a.value) && a.value.head === "Parens" && a.value.args.length === 0) called = true;
  else if (!(isCall(a.value) && a.value.head === "Angles")) values.push(await api.evaluate(a.value, api.context));
}
// What the graph says a member by this name is, in this language: xs.map(f) is Map(xs, f)
// (Method("map", 1, Passes(1)) on Map), xs.length is Length(xs) (Property("length")). A
// callback given more than the Concept passes it (the index, the array) stays a method call.
const code = (api.context.args ?? []).map((a) => a.value).find((f) => isCall(f) && f.head === "Code");
const here = (r) => r.context === undefined || (code !== undefined && api.format(r.context) === api.format(code));
const members = (head) => api.store.mentioning(name).filter((m) => here(m.relation) && isCall(m.relation.claim) && m.relation.claim.head === head && m.relation.claim.args[0].value === name);
if (values.length || called) {
  for (const m of members("Method")) {
    const [, count, passes] = m.relation.claim.args.map((a) => a.value);
    if (count !== values.length) continue;
    const f = values[0];
    const given = isCall(f) && f.head === "Lambda" && isCall(f.args[0].value) ? f.args[0].value.args.length : 0;
    if (isCall(passes) && passes.head === "Passes" && given > passes.args[0].value) continue;
    return api.call(m.identity, of, ...values);
  }
  return api.call("Call", got, ...values);
}
for (const m of members("Property")) return api.call(m.identity, of);
return got;
