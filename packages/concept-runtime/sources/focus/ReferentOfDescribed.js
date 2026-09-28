// @realization ReferentOf($said), context = Execution(), evaluateArguments = false
// What a description means ("my shopping list", "the box"): the newest thing in play of that
// kind, else the newest thing made of it at all. Whose it is and which ("my", "the") say nothing
// of the kind. A kind with describers ("shopping list") must be that kind; one without ("my
// list") any thing of it. The call itself when nothing made is of it.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const none = api.call("ReferentOf", bindings.get("said"));
  let said = bindings.get("said");
  const aside = (e) => isCall(e) && e.args.length === 1 && api.typesOf(api.call(e.head)).some((k) => k === "Possessive" || k === "Determiner");
  while (aside(said)) said = said.args[0].value;
  if (!isCall(said)) return none;
  const kind = await api.evaluate(api.call("KindNamed", said), api.call("Execution"));
  if (!isCall(kind) || kind.head === "KindNamed") return none;
  const made = (t) => isCall(t) && /_[0-9]+$/.test(t.head) && api.typesOf(t).includes(kind.head);
  const conversation = api.ambient("conversation");
  if (conversation) {
    const focus = await api.evaluate(api.call("ConversationFocus", conversation), api.call("Execution"));
    const inPlay = isCall(focus) && focus.head === "List" ? focus.args.map((a) => (isCall(a.value) && a.value.head === "AskedAs" ? a.value.args[0].value : a.value)) : [];
    const found = inPlay.find(made);
    if (found) return found;
  }
  // Else what was made of it before, newest first.
  const seq = (u) => Math.max(0, ...u.relations.flatMap((r) => (r.stamps ?? []).map((s) => s.seq)));
  const before = api.store
    .all()
    .filter((u) => made(api.call(u.identity)))
    .sort((a, b) => seq(b) - seq(a));
  return before.length ? api.call(before[0].identity) : none;
};
