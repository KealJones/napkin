async (args, bindings, api) => {
  // An operator reads as the Concept the graph says it is a synonym of, else as itself.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const unit = api.store.get(self.head);
  const synonym = unit ? unit.relations.find((r) => isCall(r.claim) && r.claim.head === "SynonymOf" && isCall(r.claim.args[0].value)) : undefined;
  return { head: synonym ? synonym.claim.args[0].value.head : self.head, args: self.args };
}
