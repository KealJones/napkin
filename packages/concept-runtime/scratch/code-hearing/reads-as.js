async (args, bindings, api) => {
  // An operator or a leading word reads as the Concept the graph says it is a synonym of, else
  // as itself. Holding nothing, a leading word is only a name here ("type", "from").
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const values = self.args.filter((a) => a.name === undefined);
  const said = self.args.find((a) => a.name === "said");
  if (said) {
    // Typed other than as its plain name ("Set" beside "set"): only a name here.
    const passed = values.map((a) => a.value).filter((v) => !(isCall(v) && (v.head === "Angles" || (v.head === "Parens" && v.args.length === 0))));
    const called = values.some((a) => isCall(a.value) && a.value.head === "Parens" && a.value.args.length === 0);
    const variable = api.fromHost({ variable: said.value });
    return passed.length || called ? api.call("Call", variable, ...passed) : variable;
  }
  if (!values.length) {
    return api.fromHost({ variable: said ? said.value : self.head[0].toLowerCase() + self.head.slice(1) });
  }
  const unit = api.store.get(self.head);
  const synonym = unit ? unit.relations.find((r) => isCall(r.claim) && r.claim.head === "SynonymOf" && isCall(r.claim.args[0].value)) : undefined;
  return { head: synonym ? synonym.claim.args[0].value.head : self.head, args: values };
}
