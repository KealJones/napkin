// @realization Note($line), context = Declarative(), evaluateArguments = false
// What is told and nothing takes: noted, with a reply when the conversation corpus has one.
async (args, bindings, api) => {
  const line = bindings.get("line");
  const message = api.ambient("message");
  const reply = message && !message.includes("?") ? await api.evaluate(api.call("Reply", message)) : undefined;
  return reply && reply.head === "Reply" && reply.args.length ? { head: "Noted", args: [{ value: line }, { name: "reply", value: reply }] } : api.call("Noted", line);
};
