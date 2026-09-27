// @realization Fixed($code, Rest($about)), context = Speaking(), evaluateArguments = false
// Code fixed: what was changed, then the code.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const named = (k) => args.find((a) => a.name === k)?.value;
  const changes = named("changes");
  const list = isCall(changes) ? changes.args.map((a) => String(a.value)) : [];
  const shown = await api.evaluate(bindings.get("code"), api.call("Speaking"));
  const as = named("writtenAs");
  const said = list.length === 1 ? "Fixed: " + list[0] + "." : "Fixed:\n" + list.map((c) => "- " + c).join("\n");
  return said + "\n\n" + (typeof shown === "string" ? shown : "") + (isCall(as) ? "\n\n(Written in " + as.head + ": I can't write its own language yet.)" : "");
};
