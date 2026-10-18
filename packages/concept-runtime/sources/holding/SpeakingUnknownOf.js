// @realization Unknown($of, $what), context = Speaking(), evaluateArguments = false
// Not known, of someone or something ("I don't know Sam's age yet", "your cat's name"): whose it is,
// said by the word that refers to it when one does (Me: "your"), then what is not known.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const of = bindings.get("of");
  const what = bindings.get("what");
  const say = async (e) => {
    const r = await api.evaluate(api.call("Say", e), api.call("Execution"));
    return typeof r === "string" ? r.replace(/[.!?]+$/, "") : "";
  };
  if (!isCall(what) || what.args.length) return api.call("Unknown", of, what);
  const possessive = isCall(of) && !of.args.length
    ? api.store.asObject(of.head).find((t) => t.predicate === "Refers" && (api.store.get(t.subject)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0]?.value) && r.claim.args[0].value.head === "Possessive"))
    : undefined;
  const words = possessive ? await say(api.call(possessive.subject, what)) : "";
  if (words) return `I don't know ${words} yet.`;
  const owner = await say(of);
  const thing = (await say(what)).toLowerCase();
  if (!owner || !thing) return api.call("Unknown", of, what);
  return `I don't know ${owner}${/s$/i.test(owner) ? "'" : "'s"} ${thing} yet.`;
};
