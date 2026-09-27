async (args, bindings, api) => {
  // A word read as code that has no reading of its own is a name: alone, the variable it
  // names ($element); holding things, or said with its empty brackets, a call of it (print(x),
  // print()). Angles after it are what types it is used at, set aside here.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const said = self.args.find((a) => a.name === "said");
  const name = said ? said.value : self.head[0].toLowerCase() + self.head.slice(1);
  const values = self.args.filter((a) => a.name === undefined).map((a) => a.value);
  const called = values.some((v) => isCall(v) && v.head === "Parens" && v.args.length === 0);
  const passed = values.filter((v) => !(isCall(v) && ((v.head === "Parens" && v.args.length === 0) || v.head === "Angles")));
  const variable = api.fromHost({ variable: name });
  return passed.length || called ? api.call("Call", variable, ...passed) : variable;
}
