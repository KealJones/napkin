// @realization Believe($line, Rest($asked)), context = Execution(), evaluateArguments = false, properties = List(Effectful())
// A statement read as who or what it is about and what is said of it. Its shape is
// Subject(Doing(What...)): the subject is "I" (the user, an individual minted once and found by
// IsA(User())), a thing, or several joined by "or"; "my X is Y" is the user's X, which is Y. The
// doing is a verb of what was typed, kept as the relation it names: "is a" is IsA, a verb its
// base form ("likes" is Like, or Likes where that is the relation the graph declares).
// A claim whose relation is lasting (Enduring(): IsA, Likes, LivesIn ...) is kept on its subject,
// stamped from what was said: Believed(Subject, List(claim)). Anything else stays in the Said it
// already is, where Pursue finds it by shape; the line comes back unchanged.
// Asked (Believe(line, Asked())), the same reading keeps nothing: a question in a statement's
// words ("am I in a bad mood?", "does Greg like cats?", doing first) is whether that was said or
// believed: Answer(True()) when it was, the line itself when it was not.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const line = bindings.get("line");
  const asking = args.slice(1).some((a) => isCall(a.value) && a.value.head === "Asked");
  const positional = (e) => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);
  const has = (head, claim) => (api.store.get(head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === claim);
  const base = (head) => {
    const b = api.lemma(head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    return b === "be" ? "Is" : b.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  };
  // The relation a doing names: its base form, or that with an s where the graph declares that.
  const relation = (head) => {
    const b = base(head);
    return has(b, "Enduring") ? b : has(b + "s", "Enduring") ? b + "s" : b;
  };
  // A doing is a verb in what was typed ("likes" in "Greg likes cats", not "for" in "thanks for
  // the help"): what the sentence tags it, or what it is alone ("like" in "does greg like cats" is
  // tagged a preposition; alone it can be a verb).
  const tagged = (text) => api.words(text);
  const verbIn = (words, head) => {
    const first = head.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(" ")[0];
    return words.some((w) => w.text.toLowerCase() === first && [...w.tags, ...(w.could ?? [])].some((t) => t === "Verb" || t === "Copula"));
  };
  const userOf = () => api.store.all().find((u) => u.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0]?.value) && r.claim.args[0].value.head === "User"))?.identity;
  const deictic = async (h) => {
    const k = await api.evaluate(api.call("Closure", h, "IsA"), api.call("Execution"));
    return isCall(k) && k.args.some((a) => isCall(a.value) && a.value.head === "Deictic");
  };
  // Each claim a line makes: { subject, claim, owned }. The subject "Me" is the user, found later.
  const read = async (e, words, asked) => {
    const out = [];
    const claimOf = (p) => {
      if (!isCall(p) || (p.head !== "IsA" && !verbIn(words, p.head))) return undefined;
      const objects = positional(p);
      return objects.length ? { head: p.head === "IsA" ? "IsA" : relation(p.head), args: objects.map((value) => ({ value })) } : undefined;
    };
    const subject = async (s) => (isCall(s) && !positional(s).length && (!(await deictic(s.head)) || ["Me", "I"].includes(s.head)) ? s.head : undefined);
    const add = async (s, claim, owned) => {
      const who = await subject(s);
      if (who && claim) out.push({ subject: who, claim, owned });
    };
    if (!isCall(e)) return out;
    if (e.head === "My" && positional(e).length === 1) {
      // "My name is Keal": the user's name, which is Keal.
      const owned = positional(e)[0];
      const said = positional(owned)[0];
      if (isCall(owned) && isCall(said) && verbIn(words, said.head) && base(said.head) === "Is" && positional(said).length === 1) await add(api.call("Me"), { head: owned.head, args: [{ value: positional(said)[0] }] }, true);
    } else if (e.head === "Or") {
      // "Woops or Whoops is a word": said of each.
      const parts = positional(e);
      const claim = claimOf(parts[parts.length - 1]);
      for (const s of parts.slice(0, -1)) await add(s, claim);
    } else if (positional(e).length === 1 && e.args.length === 1) {
      const inner = positional(e)[0];
      // Asked doing first ("am I in a bad mood", "does Greg like cats"): Doing(Subject(What)) is
      // Subject(Doing(What)), and a helper "does" is no doing of its own.
      if (asked && isCall(inner) && positional(inner).length === 1 && isCall(positional(inner)[0])) {
        const rest = positional(inner)[0];
        await add({ head: inner.head, args: [] }, claimOf(base(e.head) === "Do" ? rest : { head: e.head, args: [{ value: rest }] }));
      }
      await add({ head: e.head, args: [] }, claimOf(inner));
    }
    return out;
  };
  const message = String(api.ambient("message") ?? "");
  const claims = await read(line, tagged(message), asking);
  const same = (a, b) => api.format(a) === api.format(b);
  if (asking) {
    const user = userOf();
    const who = (s) => (s === "Me" || s === "I" ? user : s);
    // Believed: kept on its subject.
    for (const c of claims) if (who(c.subject) && (api.store.get(who(c.subject))?.relations ?? []).some((r) => same(r.claim, c.claim))) return api.call("Answer", api.call("True"));
    // Said: a statement the user made, read the same way.
    for (const unit of api.store.all()) {
      for (const r of unit.relations) {
        const s = r.claim;
        if (!isCall(s) || s.head !== "Said" || !isCall(s.args[0]?.value) || s.args[0].value.head !== "Me") continue;
        const content = s.args[1]?.value;
        const text = s.args.find((a) => a.name === "text")?.value;
        const lines = isCall(content) && content.head === "Sequence" ? positional(content) : [content];
        for (const l of lines) {
          if (!isCall(l) || (l.head !== "Mood" && l.head !== "ContextScope") || !isCall(l.args[0]?.value) || l.args[0].value.head !== "Declarative") continue;
          const told = await read(l.args[1].value, tagged(String(text ?? "")), false);
          if (told.some((t) => claims.some((c) => t.subject === c.subject && same(t.claim, c.claim)))) return api.call("Answer", api.call("True"));
        }
      }
    }
    return api.call("Believe", line, api.call("Asked"));
  }
  // Only what lasts is kept on its subject; the rest is already kept, in the Said.
  const lasting = claims.filter((c) => c.claim.head === "IsA" || has(c.claim.head, "Enduring"));
  if (!lasting.length) return api.call("Believe", line);
  const believed = [];
  for (const c of lasting) {
    let who = c.subject;
    if (who === "Me" || who === "I") {
      who = userOf();
      if (!who) {
        const minted = await api.evaluate(api.call("Mint", api.call("User")), api.call("Execution"));
        if (!isCall(minted)) continue;
        who = minted.head;
        api.store.addRelation(who, api.call("IsA", api.call("User")), undefined, api.trace.cause);
      }
    }
    api.store.addRelation(who, c.claim, undefined, api.trace.cause);
    believed.push({ head: "Believed", args: [{ value: api.call(who) }, { value: api.call("List", c.claim) }, ...(c.owned ? [{ name: "owned", value: api.call("True") }] : [])] });
  }
  if (!believed.length) return api.call("Believe", line);
  return believed.length === 1 ? believed[0] : api.call("Sequence", ...believed);
};
