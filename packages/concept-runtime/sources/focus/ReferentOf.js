// @realization ReferentOf($word), context = Execution(), evaluateArguments = false
// What a pointing word ("he", "she") points at in this conversation: the newest thing in play of
// every kind it points at (someone, male), else the newest nothing is known of, else the newest
// of the first kind. The call itself
// when the word points at no kind, or nothing in play fits.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const word = String(api.toHost(bindings.get("word")));
  const none = api.call("ReferentOf", word);
  const conversation = api.ambient("conversation");
  if (!conversation || !word) return none;
  const head = word[0].toUpperCase() + word.slice(1).toLowerCase();
  const kinds = (api.store.get(head)?.relations ?? [])
    .map((r) => r.claim)
    .filter((c) => isCall(c) && c.head === "PointsAt" && isCall(c.args[0]?.value))
    .map((c) => c.args[0].value.head);
  if (!kinds.length) return none;
  const focus = await api.evaluate(api.call("ConversationFocus", conversation), api.call("Execution"));
  const inPlay = isCall(focus) && focus.head === "List" ? focus.args.map((a) => a.value) : [];
  const things = inPlay.map((t) => (isCall(t) && t.head === "AskedAs" ? t.args[0].value : t));
  // The kind it was asked as, when it answered a question that named one.
  const askedAs = (t) => {
    const at = inPlay.find((x) => isCall(x) && x.head === "AskedAs" && x.args[0].value.head === t.head);
    return at ? at.args[1].value.head : undefined;
  };
  // A kind it is (IsA, through the hierarchy), or a value it holds (SexOrGender(Male())).
  const fits = async (thing, kind) => {
    if (askedAs(thing) === kind) return true;
    const is = await api.evaluate(api.call("Closure", thing.head, "IsA"), api.call("Execution"));
    if (isCall(is) && is.head === "List" && is.args.some((a) => isCall(a.value) && a.value.head === kind)) return true;
    return (api.store.get(thing.head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.args.some((a) => isCall(a.value) && a.value.head === kind && !a.value.args.length));
  };
  for (const thing of things) {
    let all = true;
    for (const k of kinds) if (!(await fits(thing, k))) all = false;
    if (all) return thing;
  }
  // Then one nothing held says what it is of (a name learned in passing), which cannot be ruled
  // out, before one that fits only in part ("she" is not the man just named).
  const unknown = (t) => (askedAs(t) === undefined || askedAs(t) === kinds[0]) && !(api.store.get(t.head)?.relations ?? []).some((r) => isCall(r.claim) && !["Named", "SameAs"].includes(r.claim.head));
  const open = things.find(unknown);
  if (open) return open;
  for (const thing of things) if (await fits(thing, kinds[0])) return thing;
  return none;
};
