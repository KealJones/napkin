// @realization Interjected($line), context = Execution(), evaluateArguments = false
// A word said alone that the dictionary gives as an interjection ("k", "lol", "hmm"): talk, not
// a thing to look up. What it is is kept, from Wiktionary, and it is noted as told, with a reply.
// The call itself when it is not one.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const line = bindings.get("line");
  const none = api.call("Interjected", line);
  if (!isCall(line) || line.args.length) return none;
  const kinds = await api.evaluate(api.call("Closure", line.head, "IsA"));
  let talk = isCall(kinds) && kinds.head === "List" && kinds.args.some((a) => isCall(a.value) && a.value.head === "Interjection");
  if (!talk) {
    // Said alone, as a reply, a word means what makes sense of that ("k" is okay, not potassium,
    // though it is both): asked of any word, unless it is something Napkin does.
    if ((api.store.get(line.head)?.realizations ?? []).some((r) => !r.retired)) return none;
    const word = line.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    const senses = await api.evaluate(api.call("Senses", word, "Interjection"));
    const listed = isCall(senses) && isCall(senses.args[1]?.value) ? senses.args[1].value.args : [];
    if (!listed.length) return none;
    const from = senses.args.find((a) => a.name === "from");
    api.store.addRelation(line.head, api.call("IsA", api.call("Interjection")), undefined, api.trace.cause);
    if (from) api.store.addRelation(line.head, api.call("Means", listed[0].value, from.value), undefined, api.trace.cause);
    talk = true;
  }
  // What it means, said instead, when that is something Napkin answers ("k" means "OK", and
  // "OK" is Got it); else noted as it was said.
  const means = (api.store.get(line.head)?.relations ?? []).map((r) => r.claim).find((c) => isCall(c) && c.head === "Means" && typeof c.args[0]?.value === "string");
  if (means) {
    const heard = await api.evaluate(api.call("Hear", means.args[0].value));
    const lines = isCall(heard) && heard.head === "Phrases" ? heard.args.filter((a) => a.name === undefined) : [];
    const inner = lines.length === 1 && isCall(lines[0].value) ? lines[0].value : undefined;
    const said = inner && isCall(inner) && inner.head === "ContextScope" ? inner.args[1]?.value : inner;
    if (isCall(said) && said.head !== line.head) {
      const answered = await api.evaluate(inner, api.call("Execution"));
      if (isCall(answered) && answered.head === "Answer") return answered;
    }
  }
  return api.evaluate(api.call("Note", line), api.call("Context", api.call("Execution"), api.call("Declarative")));
};
