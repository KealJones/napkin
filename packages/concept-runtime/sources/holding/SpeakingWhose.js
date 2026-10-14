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
  const owner = words(bindings.get("owner"));
  const what = words(bindings.get("what")).toLowerCase();
  const text = `${owner}${/s$/i.test(owner) ? "'" : "'s"} ${what}`;
  return text[0].toUpperCase() + text.slice(1) + ".";
};
