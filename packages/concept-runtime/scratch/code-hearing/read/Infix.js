// An operator or a leading word reads as the Concept the graph says it is a synonym of, else as
// itself, what it holds read. Holding nothing, a leading word is only a name here ("type",
// "from").
if (!parts.length) return variable(self);
const unit = api.store.get(self.head);
const synonym = unit ? unit.relations.find((r) => isCall(r.claim) && r.claim.head === "SynonymOf" && isCall(r.claim.args[0].value)) : undefined;
const xs = [];
for (const p of parts) xs.push(await read(p));
return api.call(synonym ? synonym.claim.args[0].value.head : self.head, ...xs);
