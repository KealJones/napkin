// @realization Continues($line), context = Interrogative(), evaluateArguments = false
// A question that is only what narrows the last one ("In the United States?", after "When was
// the film Jaws released?"): the last question asked, with it, heard as one and asked again. The
// call itself when it is not only a phrase of where or when, or nothing was asked before.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const line = bindings.get("line");
  const none = api.call("Continues", line);
  if (!isCall(line) || line.args.length !== 1 || !api.typesOf(api.call(line.head)).includes("Preposition")) return none;
  const conversation = api.ambient("conversation");
  const message = api.ambient("message");
  if (!conversation || typeof message !== "string") return none;
  const seq = (r) => Math.max(0, ...(r.stamps ?? []).map((s) => s.seq));
  // The last question that was a whole one: a narrowing said before this ("In the United
  // States?", then "in Germany?") is passed over for the question it narrowed.
  const line_ = (e) => (isCall(e) && e.head === "ContextScope" && e.args.length === 2 ? e.args[1].value : e);
  const narrows = (e) => isCall(e) && e.args.length === 1 && api.typesOf(api.call(e.head)).includes("Preposition");
  const asked = (api.store.get(String(conversation))?.relations ?? [])
    .filter((r) => isCall(r.claim) && r.claim.head === "Said" && isCall(r.claim.args[0]?.value) && r.claim.args[0].value.head === "Me")
    .sort((a, b) => seq(b) - seq(a))
    .filter((r) => !narrows(line_(r.claim.args[1]?.value)))
    .map((r) => r.claim.args.find((a) => a.name === "text")?.value)
    .find((t) => typeof t === "string" && t.trim() && t.trim() !== message.trim());
  if (!asked) return none;
  const said = asked.trim().replace(/[?.!]+$/, "") + " " + message.trim().replace(/^[A-Z]/, (x) => x.toLowerCase());
  const heard = await api.evaluate(api.call("Hear", said, "rules"));
  const lines = isCall(heard) && heard.head === "Phrases" ? heard.args.filter((a) => a.name === undefined) : [];
  if (lines.length !== 1) return none;
  return api.evaluate(lines[0].value, api.call("Execution"));
};
