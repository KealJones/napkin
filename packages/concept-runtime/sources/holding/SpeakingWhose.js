// @realization Whose($owner, $what), context = Speaking(), evaluateArguments = false
// Who someone is to another, said with whose it is: Whose(Tom(), Brother()) is "Tom's brother".
// An individual is said by the name it holds (Sam_1 Named "Sam").
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const words = (e) => {
    if (!isCall(e)) return String(e);
    const named = (api.store.get(e.head)?.relations ?? []).map((r) => r.claim).find((x) => isCall(x) && x.head === "Named");
    if (named && typeof named.args[0]?.value === "string") return named.args[0].value;
    return e.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  };
  // Whose by a word that says it of one in the talk ("my" Refers(Me())): that word, as the one spoken to says it ("your").
  const ownerExpr = bindings.get("owner");
  const possessive = isCall(ownerExpr)
    ? api.store.asObject(ownerExpr.head).find((t) => t.predicate === "Refers" && (api.store.get(t.subject)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0]?.value) && r.claim.args[0].value.head === "Possessive"))
    : undefined;
  const what = words(bindings.get("what")).toLowerCase();
  const said = possessive && isCall(bindings.get("what")) ? await api.evaluate(api.call("Words", api.call(possessive.subject, bindings.get("what"))), api.call("Execution")) : undefined;
  const text = typeof said === "string" ? said : `${words(ownerExpr)}${/s$/i.test(words(ownerExpr)) ? "'" : "'s"} ${what}`;
  return text[0].toUpperCase() + text.slice(1) + ".";
};
