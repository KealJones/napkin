async (args, bindings, api) => {
  // A word read as code that has no reading of its own is a name: alone, the variable it
  // names ($element); holding things, a call of it with them (print(x)).
  const self = bindings.get("word");
  const said = self.args.find((a) => a.name === "said");
  const name = said ? said.value : self.head[0].toLowerCase() + self.head.slice(1);
  const values = self.args.filter((a) => a.name === undefined).map((a) => a.value);
  const variable = api.fromHost({ variable: name });
  return values.length ? api.call("Call", variable, ...values) : variable;
}
