// @realization Fills($line), context = Execution(), evaluateArguments = false
// Things told of a holder just made go in it: "make a shopping list? I need milk, eggs" (the
// same message), or "milk, eggs" said alone while it is the newest thing in play. What goes in
// is the group the line names (milk, eggs), else what it ends on (milk, in "I need milk"). The
// call itself otherwise, to be noted as told.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const line = bindings.get("line");
  const none = api.call("Fills", line);
  const conversation = api.ambient("conversation");
  if (!conversation || !isCall(line)) return none;
  const focus = await api.evaluate(api.call("ConversationFocus", conversation), api.call("Execution"));
  const newest = isCall(focus) && focus.head === "List" && focus.args.length ? focus.args[0].value : undefined;
  const holder = isCall(newest) && /_[0-9]+$/.test(newest.head) && api.typesOf(newest).includes("Collection") ? newest : undefined;
  if (!holder) return none;
  const now = api.trace.cause;
  // Made in this message: what it is was said now, not only what it holds.
  const madeNow = now !== undefined && (api.store.get(holder.head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "IsA" && (r.stamps ?? []).some((s) => s.source === now));
  const group = (e) => isCall(e) && (e.head === "And" || e.head === "List");
  const find = (e) => {
    if (!isCall(e)) return undefined;
    if (group(e)) return e;
    for (const a of e.args) {
      const inner = a.name === undefined ? find(a.value) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  // What a line ends on: its last word's last thing, past who is speaking.
  const last = (e) => {
    let at = e;
    while (isCall(at) && at.args.length && at.args.every((a) => a.name === undefined) && !group(at)) {
      const next = at.args[at.args.length - 1].value;
      if (!isCall(next) || (!next.args.length && api.typesOf(next).includes("Deictic"))) break;
      if (!next.args.length) return next;
      at = next;
    }
    return group(at) ? at : undefined;
  };
  // Said alone, only things: no doing, no one speaking.
  const onlyThings = group(line) || (isCall(line) && !api.typesOf(api.call(line.head)).includes("Deictic") && line.args.every((a) => isCall(a.value) && !a.value.args.length));
  if (!madeNow && !onlyThings) return none;
  const items = find(line) ?? (onlyThings ? line : last(line));
  if (!items) return none;
  const done = await api.evaluate(api.call("Change", api.call("Add"), api.call("And", items, api.call("To", holder))), api.context);
  return done && done.head === "Change" ? none : done;
};
