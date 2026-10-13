// @realization Explanation(Rest($x)), context = Speaking(), evaluateArguments = false
// Why, said as a chain: the cause ("Because of Rayleigh scattering."), then what the cause is,
// then where each link was read. A connective that a clause follows says the clause as it is.
async (args, bindings, api) => {
  const named = (n) => {
    const a = args.find((x) => x.name === n);
    return a ? a.value : undefined;
  };
  const cause = named("cause");
  if (typeof cause !== "string" || !cause) return "";
  const connective = named("connective");
  const clause = connective && connective.head && api.store.asSubject(connective.head).some((t) => t.predicate === "Introduces" && t.expr.args[0] && t.expr.args[0].value && t.expr.args[0].value.head === "Clause");
  const parts = [(clause ? "Because " : "Because of ") + cause.replace(/[.\s]+$/, "") + "."];
  const is = named("is");
  if (typeof is === "string" && is) parts.push(is.trim());
  const from = named("from");
  const pages = from && from.args ? from.args.map((a) => String(a.value)) : [];
  if (pages.length) parts.push("(From Wikipedia: " + pages.join("; ") + ".)");
  return parts.join(" ");
};
