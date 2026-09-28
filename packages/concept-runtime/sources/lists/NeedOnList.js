// @realization Me(Need($items)), context = Declarative(), evaluateArguments = false
// "I need milk, eggs", said while a list is in play in the conversation: put on it. The call
// itself otherwise, to be noted as told.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const items = bindings.get("items");
  const none = api.call("Me", api.call("Need", items));
  const conversation = api.ambient("conversation");
  if (!conversation) return none;
  const focus = await api.evaluate(api.call("ConversationFocus", conversation), api.call("Execution"));
  const inPlay = isCall(focus) && focus.head === "List" ? focus.args.map((a) => (isCall(a.value) && a.value.head === "AskedAs" ? a.value.args[0].value : a.value)) : [];
  const list = inPlay.find((t) => isCall(t) && /_[0-9]+$/.test(t.head) && (api.store.get(t.head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0].value) && r.claim.args[0].value.head === "List"));
  if (!list) return none;
  const done = await api.evaluate(api.call("ListChange", api.call("Add"), api.call("And", items, api.call("To", list))), api.context);
  return done && done.head === "ListChange" ? none : done;
};
