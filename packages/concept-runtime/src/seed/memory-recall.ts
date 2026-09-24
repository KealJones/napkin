/**
 * Recall: answering from what was believed and from what was said (memory-spec Part 9).
 *
 * An object question ("what does greg like") is a hole where the object goes. It is looked
 * up first among lasting beliefs, the relations on the subject. A happening was never
 * believed (memory-spec Part 5.3), so "what did i eat" is answered from the `Said` that
 * holds it, found through the mention index instead of by scanning conversations
 * (Part 9.1). Reading never mints and never teaches: nothing found is an honest unknown.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

/**
 * Past tenses no rule derives. Graph data rather than a table in code, so the Teacher can
 * add one the same way (reading-spec Part 5.7, `PastOf`). A regular verb needs none.
 */
const IRREGULAR: Record<string, string> = {
  Eat: "Ate", Go: "Went", See: "Saw", Buy: "Bought", Make: "Made", Have: "Had", Get: "Got",
  Take: "Took", Drink: "Drank", Write: "Wrote", Meet: "Met", Tell: "Told", Say: "Said",
  Give: "Gave", Come: "Came", Do: "Did", Run: "Ran", Find: "Found", Think: "Thought",
  Bring: "Brought", Leave: "Left", Feel: "Felt", Pay: "Paid", Send: "Sent", Win: "Won",
  Lose: "Lost", Sleep: "Slept", Speak: "Spoke", Break: "Broke", Drive: "Drove", Ride: "Rode",
  Sing: "Sang", Swim: "Swam", Teach: "Taught", Catch: "Caught", Sell: "Sold", Build: "Built",
  Read: "Read", Hear: "Heard", Know: "Knew", Grow: "Grew", Fly: "Flew", Draw: "Drew",
  Wear: "Wore", Begin: "Began", Forget: "Forgot", Keep: "Kept", Sit: "Sat", Stand: "Stood",
  Understand: "Understood", Watch: "Watched",
};

const HELPERS = `
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const positional = (e) => (isCall(e) ? e.args.filter((a) => a.name === undefined).map((a) => a.value) : []);
  const named = (e, n) => (isCall(e) ? e.args.find((a) => a.name === n)?.value : undefined);
  const user = () => api.store.asObject("User").find((t) => t.predicate === "IsA")?.subject;
  // Who a subject is: the user, the system, an individual a name resolved to, or the word.
  const about = (subject) => {
    if (!isCall(subject)) return undefined;
    const resolved = named(subject, "resolvedTo");
    if (isCall(resolved)) return resolved.head;
    if (subject.head === "Me") return user();
    if (subject.head === "You") return "Self";
    return subject.head;
  };
  const thirdPerson = (head) => head.replace(/^([A-Z][a-z]*?)(s?)(?=[A-Z]|$)/, (m, w, s) => (s || /s$/.test(w) ? m : w + "s"));
  const past = (head) => {
    const held = api.store.asObject(head).find((t) => t.predicate === "PastOf");
    if (held) return held.subject;
    const [, w, rest] = /^([A-Z][a-z]*)(.*)$/.exec(head) ?? [, head, ""];
    return (/e$/.test(w) ? w + "d" : w + "ed") + rest;
  };
  // What was said by the user, newest first: (relation, stamp) pairs, since saying the same
  // thing twice is one relation with two stamps (memory-spec Part 4.3).
  const saidByUser = (mention) =>
    api.store
      .mentioning(mention)
      .map((m) => m.relation)
      .filter((r) => isCall(r.claim) && r.claim.head === "Said" && isCall(positional(r.claim)[0]) && positional(r.claim)[0].head === "Me")
      .flatMap((r) => (r.stamps ?? []).map((st) => ({ content: positional(r.claim)[1], seq: st.seq, at: st.recordedAt })))
      .sort((a, b) => b.seq - a.seq);
  // Two times (memory-spec Part 4.1): a relative time is kept as said, and anchored on read
  // to the recorded time of the stamp it was said under. No time word means it happened
  // when it was said.
  const DAY = 86400000;
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const offset = (e) => {
    let found;
    walk(e, (n) => {
      if (found !== undefined) return;
      if (n.head === "Today" && !n.args.length) found = 0;
      else if (n.head === "Yesterday" && !n.args.length) found = -1;
      else if (n.head === "Tomorrow" && !n.args.length) found = 1;
      else if (n.head === "Ago" && isCall(n.args[0]?.value) && n.args[0].value.head === "Days" && typeof n.args[0].value.args[0]?.value === "number") found = -n.args[0].value.args[0].value;
    });
    return found;
  };
  const RELATIVE = ["Today", "Yesterday", "Tomorrow", "Ago"];
  const eventDay = (e, at) => midnight(new Date(at)) + (offset(e) ?? 0) * DAY;
  // An explicit date said with it: "on october 15th 2024" is On(Date(year=, month=, day=)).
  // A month is said as its word, October(), and computed as its number.
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dateIn = (e) => {
    let found;
    walk(e, (n) => {
      if (found || n.head !== "Date") return;
      const f = (k) => n.args.find((a) => a.name === k)?.value;
      const m = f("month");
      const month = typeof m === "number" ? m : isCall(m) ? MONTH.indexOf(m.head) + 1 : 0;
      if (month > 0) found = { year: f("year"), month, day: f("day") };
    });
    return found;
  };
  // When it happened, as fields: an explicit date if one was said, else the day anchored
  // from the stamp. A date said without a year is in the year it was said.
  const happened = (e, at) => {
    const explicit = dateIn(e);
    if (explicit) return { year: explicit.year ?? new Date(at).getFullYear(), month: explicit.month, day: explicit.day };
    const d = new Date(eventDay(e, at));
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  };
  // What the question asks for, as fields: "yesterday" is a whole day, "in october 2024" a
  // month. Undefined when it asks for no time at all.
  const askedFor = (e) => {
    const explicit = dateIn(e);
    if (explicit) return explicit;
    const o = offset(e);
    if (o === undefined) return undefined;
    const d = new Date(midnight(new Date()) + o * DAY);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  };
  const within = (event, asked) => ["year", "month", "day"].every((k) => asked[k] === undefined || asked[k] === event[k]);
  // Said back the way it is true now: pancakes said "today" yesterday were eaten yesterday.
  const anchored = (e, day) => {
    if (!isCall(e)) return e;
    if (RELATIVE.includes(e.head)) {
      const diff = Math.round((day - midnight(new Date())) / DAY);
      if (diff === 0) return api.call("Today");
      if (diff === -1) return api.call("Yesterday");
      if (diff === 1) return api.call("Tomorrow");
      const d = new Date(day);
      return api.call("On", { head: "Date", args: [{ name: "year", value: d.getFullYear() }, { name: "month", value: d.getMonth() + 1 }, { name: "day", value: d.getDate() }] });
    }
    return { head: e.head, args: e.args.map((a) => ({ ...a, value: anchored(a.value, day) })) };
  };
  // Only a claim tells anything: a question or a request said earlier is not something
  // the user told.
  const told = (content) =>
    !(isCall(content) && content.head === "Mood") || (isCall(positional(content)[0]) && positional(content)[0].head === "Declarative");
  const walk = (e, visit) => {
    if (!isCall(e)) return;
    visit(e);
    for (const a of e.args) walk(a.value, visit);
  };
`;

/**
 * `WhatDo(Me(), Like())`: the object of a relation on the subject. Beliefs first, in the
 * form a relation is stored under; then happenings said, in the past tense for `Did`.
 * "where does greg work" asks for the place, so `Works` also finds `WorksAt` and `WorksIn`.
 */
const objectQuestion = (head: string, tense: "present" | "past") =>
  concept(head, {
    realizations: [
      realization({
        pattern: `${head}($subject, $verb)`,
        context: "Context(Execution(), Interrogative())",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          ${HELPERS}
          const [subject, asked] = [args[0].value, args[1].value];
          // "what did i eat in october" fuses the preposition onto the verb: EatIn(...) is Eat.
          const verb = isCall(asked) && /^[A-Z][a-z]+(In|On|At|During)$/.test(asked.head) && asked.args.length
            ? { head: asked.head.replace(/(In|On|At|During)$/, ""), args: asked.args }
            : asked;
          const who = about(subject);
          if (!isCall(subject) || !isCall(verb)) return api.call("Answer", api.call("Unknown"));

          const topic = positional(verb).find((v) => isCall(v) && v.head === "About");
          // "what do you know about me": what is held about it.
          if (topic && verb.head === "Know") return await api.evaluate(topic);
          // "what did i tell you about greg": everything said mentioning Greg.
          if (topic && ["Tell", "Say"].includes(verb.head)) {
            const of = positional(topic)[0];
            const said = saidByUser(of).filter((s) => told(s.content)).map((s) => s.content);
            return said.length ? api.call("Answer", api.call("List", ...said)) : api.call("Answer", api.call("Unknown"));
          }

          // "what does she do" asks what someone is: her work is what she was said to be.
          if (who && verb.head === "Do" && "${tense}" === "present" && !positional(verb).length) {
            const kinds = api.relations.of(who).filter((t) => t.predicate === "IsA" && !(t.object && t.object.head === "User")).map((t) => t.object);
            if (kinds.length) return api.call("Answer", kinds.length === 1 ? kinds[0] : api.call("List", ...kinds));
          }
          const predicate = thirdPerson(verb.head);
          // Nobody believed anything about yet: only what was said can answer.
          const held = !who ? [] : api.relations
            .of(who)
            .filter((t) => t.predicate === predicate || t.predicate.startsWith(predicate))
            .map((t) => (positional(t.expr).length === 1 ? positional(t.expr)[0] : t.expr));
          if (held.length) return api.call("Answer", held.length === 1 ? held[0] : api.call("List", ...held));

          // A happening: the clause said, "Me(Ate(...))", found by its verb. "what did i do"
          // asks for any happening, so any clause the subject heads will do.
          const any = verb.head === "Do";
          const form = "${tense}" === "past" ? past(verb.head) : predicate;
          // A time in the question is a day or a month to match; the rest must appear in what
          // was said.
          const target = askedFor(verb);
          const extra = positional(verb).filter((v) => offset(v) === undefined && !dateIn(v)).map((v) => api.format(v));
          const found = [];
          for (const s of saidByUser(api.call(any ? subject.head : form))) {
            if (!told(s.content)) continue;
            walk(s.content, (node) => {
              if (node.head !== subject.head) return;
              const clause = positional(node).find((v) => isCall(v) && (any ? v.args.length > 0 || v.head !== "Is" : v.head === form));
              if (!clause) return;
              const text = api.format(clause);
              if (!extra.every((x) => text.includes(x))) return;
              if (target !== undefined && !within(happened(node, s.at), target)) return;
              const said = anchored(node, eventDay(node, s.at));
              if (!found.some((f) => api.format(f) === api.format(said))) found.push(said);
            });
          }
          if (!found.length) return api.call("Answer", api.call("Unknown"));
          return api.call("Answer", found.length === 1 ? found[0] : api.call("List", ...found));
        }`),
      }),
    ],
  });

/**
 * `Who(Likes(Cats()))`: a hole where the subject goes. "find the units holding Likes(Cats())"
 * is one lookup on the relation index (reading-spec P3), then happenings said, whose subject
 * heads the clause. "works at google" is the phrasal relation WorksAt, as it was believed.
 * Anything else is the ordinary question: "who is greg" still describes Greg.
 */
const subjectQuestion = (head: string) =>
  concept(head, {
    realizations: [
      realization({
        pattern: `${head}($claim)`,
        context: "Context(Execution(), Interrogative())",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          ${HELPERS}
          const claim = args[0].value;
          const ask = () => api.evaluate(api.call("Interrogative", claim));
          const said = positional(claim);
          if (!isCall(claim) || !said.length || claim.head === "Is" || named(claim, "resolvedTo")) return await ask();
          // Something that computes is asked for its value, not its holder.
          if ((api.store.get(claim.head)?.realizations.length ?? 0) > 0) return await ask();
          // Only a relation asks for its holder: a thing ("who is greg") is described.
          if (!said.some((v) => isCall(v) || typeof v !== "object")) return await ask();
          const PREPOSITIONS = ["At", "In", "For", "With", "On", "From", "To"];
          let predicate = thirdPerson(claim.head);
          let objects = said;
          if (said.length === 1 && isCall(said[0]) && PREPOSITIONS.includes(said[0].head)) {
            predicate = predicate + said[0].head;
            objects = positional(said[0]);
          }
          const wanted = objects.map((v) => api.format(v)).join(",");
          const first = objects[0];
          const key = isCall(first) ? first.head : first;
          const holders = key === undefined ? [] : api.store
            .asObject(isCall(first) && first.args.length === 0 ? first.head : api.format(first))
            .filter((t) => t.predicate === predicate && positional(t.expr).map((v) => api.format(v)).join(",") === wanted)
            .map((t) => api.call(t.subject));
          if (holders.length) return api.call("Answer", holders.length === 1 ? holders[0] : api.call("List", ...holders));
          // A happening said: whoever heads the clause that holds it.
          const found = [];
          for (const s of saidByUser(api.call(claim.head))) {
            if (!told(s.content)) continue;
            walk(s.content, (node) => {
              const clause = positional(node).find((v) => isCall(v) && v.head === claim.head);
              if (!clause) return;
              const text = api.format(clause);
              if (said.every((v) => text.includes(api.format(v).replace(/\\)$/, "")))) found.push(node);
            });
          }
          if (found.length) return api.call("Answer", found.length === 1 ? found[0] : api.call("List", ...found));
          return await ask();
        }`),
      }),
    ],
  });

export function memoryRecallUnits(): ConceptUnit[] {
  return [
    subjectQuestion("Who"),
    subjectQuestion("What"),
    concept("PastOf", { relations: ["IsA(RelationProperty())"] }),
    ...Object.entries(IRREGULAR).map(([base, pastForm]) => concept(pastForm, { relations: [`PastOf(${base}())`] })),
    ...["WhatDo", "WhatDoes", "WhoDo", "WhoDoes", "WhereDo", "WhereDoes"].map((h) => objectQuestion(h, "present")),
    ...["WhatDid", "WhoDid", "WhereDid"].map((h) => objectQuestion(h, "past")),
    /**
     * "tell me about greg", "what do you know about greg": what is held about it, the same
     * description a "who is" question gets, and what was told about it that never became a
     * belief.
     */
    concept("About", {
      realizations: [
        realization({
          pattern: "About($thing)",
          context: "Execution()",
          evaluateArguments: false,
          body: code(`async (args, bindings, api) => {
            ${HELPERS}
            const thing = args[0].value;
            const described = await api.evaluate(api.call("Relations", thing), api.call("Describe"));
            // What was said about it and never became a belief is still known: "greg sent
            // me a meme" is part of what there is to tell about Greg.
            const said = isCall(thing) && thing.head !== "Me"
              ? saidByUser(thing)
                  .filter((s) => told(s.content))
                  .map((s) => (isCall(s.content) && s.content.head === "Mood" ? positional(s.content)[1] : s.content))
                  .filter((c) => c && isCall(c) && c.head !== "Believe")
              : [];
            if (!said.length) return described;
            const held = isCall(described) && described.head === "Describes" ? positional(positional(described)[1]) : [];
            return api.call("Describes", thing, api.call("List", ...held, api.call("Said", api.call("List", ...said))));
          }`),
        }),
      ],
    }),
  ];
}
