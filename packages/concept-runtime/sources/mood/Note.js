// @realization Note($line), context = Declarative(), evaluateArguments = false
// What is told and nothing takes: noted, with a reply. What follows from it (packs/follows.ncon)
// comes first when the graph knows what the event leads to; a reply from the conversation corpus
// when one is close to what was said; how it felt when the corpus has nothing close. Code said
// with nothing asked of it (a line read as code, `ir=`) is explained, as "explain this" would.
async (args, bindings, api) => {
  const line = bindings.get("line");
  if (line && line.args && line.args.some((a) => a.name === "ir")) {
    const explained = await api.evaluate(api.call("Explain", line), api.call("Execution"));
    if (explained && explained.head === "Explained") return explained;
  }
  const message = api.ambient("message");
  const told = message && !message.includes("?");
  const noted = (reply) => ({ head: "Noted", args: [{ value: line }, { name: "reply", value: reply }] });
  const follows = told ? await api.evaluate(api.call("Follows", message)) : undefined;
  const has = (e, ...names) => e && e.args && e.args.some((a) => names.includes(a.name));
  const followed = follows && follows.head === "Follows" && follows.args.length ? follows : undefined;
  if (has(followed, "causes", "wants", "involves", "needs")) return noted(followed);
  const reply = told ? await api.evaluate(api.call("Reply", message)) : undefined;
  const replied = reply && reply.head === "Reply" && reply.args.length ? reply : undefined;
  if (replied && (has(replied, "close") || !followed)) return noted(replied);
  if (followed) return noted(followed);
  return api.call("Noted", line);
};
