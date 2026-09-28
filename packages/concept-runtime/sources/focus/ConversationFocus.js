// @realization ConversationFocus($conversation), context = Execution(), evaluateArguments = false
// The things a conversation has in play, newest first: what its answers were and were about, what
// its pointing words pointed at, and the things it named that Napkin holds facts of. An answer to
// a question that asked for a kind is AskedAs(thing, kind): what "where" answered is a place. Read
// from the conversation's Said, so nothing needs keeping in step with it.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const unit = api.store.get(String(api.toHost(bindings.get("conversation"))));
  const seq = (r) => Math.max(0, ...(r.stamps ?? []).map((s) => s.seq));
  const said = (unit ? unit.relations : []).filter((r) => isCall(r.claim) && r.claim.head === "Said").sort((a, b) => seq(b) - seq(a));
  const out = [];
  const same = (o, e) => (o.head === "AskedAs" ? o.args[0].value.head : o.head) === e.head;
  const add = (e, kind) => {
    if (isCall(e) && !e.args.length && !out.some((o) => same(o, e))) out.push(kind ? api.call("AskedAs", e, kind) : e);
  };
  // The kind a question asked for, by its question word (Where asks for a place).
  const asked = (e) => {
    if (!isCall(e)) return undefined;
    const k = (api.store.get(e.head)?.relations ?? []).map((r) => r.claim).find((c) => isCall(c) && c.head === "Asks");
    if (k) return k.args[0].value;
    for (const a of e.args) {
      const inner = a.name === undefined ? asked(a.value) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  // A thing, not a word: one with a name of its own (Steven Spielberg), or one met here (Greg_1).
  // "old" and "married" are grounded too, but as words, with no name.
  const held = (h) => /_[0-9]+$/.test(h) || (api.store.get(h)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "Named");
  // What an answer was, unless a pack says what it is: UnknownTruth says how it went.
  const declared = (h) => (api.store.get(h)?.relations ?? []).some((r) => (r.stamps ?? []).some((s) => s.pack !== undefined));
  const answered = (e, kind) => {
    if (!isCall(e)) return;
    if ((e.head === "Answer" || e.head === "Describes") && e.args.length) return answered(e.args[0].value, e.head === "Answer" ? kind : undefined);
    if (e.head === "List") {
      for (const a of e.args) answered(a.value, kind);
      return;
    }
    if (!e.args.length && (held(e.head) || !declared(e.head))) add(e, kind);
  };
  const named = async (e) => {
    if (!isCall(e)) return;
    if (e.head === "Ref") {
      const to = e.args.find((a) => a.name === "resolvedTo");
      if (to) answered(to.value);
      return;
    }
    if (!e.args.length && held(e.head)) add(e);
    for (const a of e.args) if (a.name === undefined) await named(a.value);
  };
  const parts = (r) => r.claim.args.filter((a) => a.name === undefined).map((a) => a.value);
  for (let i = 0; i < said.length; i++) {
    const [who, what] = parts(said[i]);
    // Newest first, so the message a reply answers is the one after it here.
    const before = i + 1 < said.length ? parts(said[i + 1]) : [];
    if (isCall(who) && who.head === "Self") answered(what, isCall(before[0]) && before[0].head === "Me" ? asked(before[1]) : undefined);
    else await named(what);
  }
  return api.call("List", ...out);
};
