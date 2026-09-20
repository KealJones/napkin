/**
 * The Concepts the network starts with (design/seed-concepts.md).
 *
 * A seed Concept is an ordinary Concept that happens to exist at time zero. It can be
 * shadowed, appended to, retired, and forgotten like any other. Seeding is idempotent and
 * additive: create when absent, otherwise add only what is not already there.
 *
 * Nothing here is stubbed. A Concept that cannot yet be honestly realized is omitted, so
 * that it produces a residual the learning path can act on rather than a wrong answer.
 */
import { type Expr, c, call, format, isCall, parse } from "../concept/expression.js";
import { codeSource, concept, declares, realization, type ConceptUnit } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);
const meaning = (text: string): Expr => c("Text", text);

const units: ConceptUnit[] = [];
const add = (u: ConceptUnit) => void units.push(u);

/* ------------------------------------------------------------------ *
 * Relation vocabulary. Pure data; the harness never reads these.
 * ------------------------------------------------------------------ */
add(concept("IsA", { relations: ["Transitive()"] }));
/**
 * Symmetric but NOT transitive, which is the whole difficulty with synonymy.
 *
 * Bright is a synonym of smart, and bright is a synonym of luminous, and smart is not a
 * synonym of luminous. Declared transitive, the chains close: a 554-Concept graph produced
 * Identity equivalent to Sameness, Role, Duty, Task and finally Chore, each hop arguable
 * and the closure nonsense. Synonym islands are a success (they are how language works);
 * synonym CONTINENTS are the failure, and transitivity is what makes them.
 */
add(concept("SynonymOf", { relations: ["Symmetric()"] }));
add(concept("InverseOf", { relations: ["Symmetric()"] }));
add(concept("Disjoint", { relations: ["Symmetric()", "Irreflexive()"] }));
// Classified, not bare. A Concept with no relations and no realizations is
// indistinguishable from an orphan, and Exist would keep trying to "fix" it. Saying what
// kind of thing it is costs one relation and makes the graph self-describing.
add(concept("Category", { relations: ["IsA(Category())"] }));
add(concept("RelationProperty", { relations: ["IsA(Category())"] }));
for (const p of ["Symmetric", "Asymmetric", "Transitive", "Reflexive", "Irreflexive", "Functional"]) {
  add(concept(p, { relations: ["IsA(RelationProperty())"] }));
}
add(concept("Incidental", { relations: ["IsA(RelationProperty())"] }));
// Machinery relations are not led with in a summary; interest is a property of the
// question, so this is a soft default and never a prohibition.
for (const p of ["SynonymOf", "Suppresses", "Symmetric", "Transitive", "InverseOf"]) {
  add(concept(p, { relations: ["Incidental()"] }));
}

/* ------------------------------------------------------------------ *
 * Realization properties, read generically through Suppresses.
 * ------------------------------------------------------------------ */
add(concept("RealizationProperty", { relations: ["IsA(Category())"] }));
add(concept("Effectful", { relations: ["IsA(RealizationProperty())"] }));
add(concept("Lossy", { relations: ["IsA(RealizationProperty())"] }));
add(concept("Pure", { relations: ["IsA(RealizationProperty())"] }));
add(concept("Suppresses", { relations: ["IsA(RelationProperty())"] }));

/* ------------------------------------------------------------------ *
 * Context facets.
 * ------------------------------------------------------------------ */
add(concept("ContextFacet", { relations: ["IsA(Category())"] }));
add(concept("TargetLanguage", { relations: ["IsA(ContextFacet())"] }));
add(concept("Execution", { relations: ["IsA(ContextFacet())"] }));
add(concept("Teaching", { relations: ["IsA(ContextFacet())"] }));
add(concept("Lexical", { relations: ["IsA(ContextFacet())"] }));
add(concept("JavaScript", { relations: ["IsA(TargetLanguage())"] }));
add(concept("Rust", { relations: ["IsA(TargetLanguage())"] }));
add(concept("TypeScript", { relations: ["IsA(TargetLanguage())"] }));
add(concept("Python", { relations: ["IsA(TargetLanguage())"] }));
add(
  concept("Describe", {
    relations: ["IsA(ContextFacet())", "Suppresses(Effectful())", "Suppresses(Lossy())"],
  }),
);

/* ------------------------------------------------------------------ *
 * The universal parent, and the relations fallback.
 *
 * Presenting a Concept's relations is what answers "what is chess" for anything with
 * relations but no composition. It is deliberately NOT a catch-all realization on
 * `$subject`: a catch-all under a Describe context would match every sub-expression, so
 * nothing would ever be residual and the expansion in concept-spec Part 4.0 would stop
 * working — describing a composed body would swallow the body instead of expanding it.
 *
 * So it is invoked explicitly, by name, on a subject that came back residual.
 * ------------------------------------------------------------------ */
/**
 * `Concept()` with no arguments is the universal parent; `Concept(identity=..., ...)` is
 * the declaration form the runtime saves. They are distinguished by arity, which patterns
 * already do.
 */
add(
  concept("Concept", {
    realizations: [
      realization({
        pattern: "Concept(identity=$identity, relations=$relations, realizations=$realizations)",
        properties: ["Effectful()"],
        evaluateArguments: false,
        body: code(`(args, bindings, api) => {
          const get = (n) => { const a = args.find((x) => x.name === n); return a ? a.value : undefined; };
          const identity = get("identity");
          if (typeof identity !== "string" || !/^[A-Z]/.test(identity)) {
            return api.call("InvalidDeclaration", identity === undefined ? api.call("Missing") : identity);
          }
          const items = (x) => (x && x.head === "List" ? x.args.map((a) => a.value) : x ? [x] : []);
          // A Teacher told to give a few relations sometimes gives two hundred, listing
          // whatever the word reminds it of -- Quantity once returned "Jerk Snap Crackle
          // Pop". The prompt asks; this enforces. Past the cap it is free association,
          // and every one of them becomes a topic the crawl then goes and studies.
          const RELATION_CAP = 12;
          api.store.seed({ identity, relations: [], realizations: [] });
          // Deduplicate BEFORE capping. A Teacher that loses the thread repeats itself --
          // "hi" came back with the same relation six times -- and counting the copies
          // against the cap spends the budget on one claim and rejects the real ones.
          const asked = [];
          for (const r of items(get("relations"))) {
            if (!asked.some((x) => api.format(x) === api.format(r))) asked.push(r);
          }
          const relations = asked.slice(0, RELATION_CAP);
          for (const r of relations) {
            if (!r || !r.head) continue;
            // In(claim, context) says the claim holds only in that sense of the word.
            // Unwrapped here, because a context is where a relation holds and not part of
            // what it says.
            const contextual = r.head === "In" && r.args.length === 2;
            const claim = contextual ? r.args[0].value : r;
            const where = contextual ? r.args[1].value : undefined;
            // A relation naming the Concept it belongs to says nothing: the subject is
            // implicit. A Teacher answered Add with relations=List(Add($left, $right)),
            // which is its own pattern filed as a fact, and it stuck in the graph.
            if (!claim || !claim.head || claim.head === identity) continue;
            api.store.addRelation(identity, claim, where);
          }

          // Realizations are behaviour, so they are saved too — a Concept taught with
          // relations alone can be described but never computed.
          let added = 0;
          const rejected = [];
          for (const decl of items(get("realizations"))) {
            if (!decl || decl.head !== "Realization") continue;
            const field = (n) => { const a = decl.args.find((x) => x.name === n); return a ? a.value : undefined; };
            const pattern = field("pattern"), body = field("body"), context = field("context");
            if (!pattern || !body) { rejected.push(api.call("Incomplete")); continue; }
            // A taught body must compose Concepts that already exist. Never code, and
            // never a name the graph has not heard of. A rejection is reported rather
            // than dropped: the missing names are the next thing to learn.
            if (body.head === "Code") { rejected.push(api.call("NotComposed", body)); continue; }
            // A body that leads back to the Concept it defines is a realization that
            // calls itself, directly or by a detour. A composition-only Teacher has no
            // business writing recursion: asked to realize Choose it wrote Select, then
            // realized Select as Choose, and the pair was inert in both directions.
            const namesIn = (e, acc) => {
              if (!e || !e.head) return acc;
              acc.add(e.head);
              for (const a of e.args) namesIn(a.value, acc);
              return acc;
            };
            const reachesSelf = () => {
              const seen = new Set();
              const queue = [...namesIn(body, new Set())];
              while (queue.length) {
                const head = queue.shift();
                if (head === identity) return true;
                if (seen.has(head)) continue;
                seen.add(head);
                const unit = api.store.get(head);
                if (!unit) continue;
                for (const r of unit.realizations) {
                  if (r.body && r.body.head === "Code") continue;
                  for (const next of namesIn(r.body, new Set())) queue.push(next);
                }
              }
              return false;
            };
            if (reachesSelf()) { rejected.push(api.call("SelfReferential", body)); continue; }
            // A body must reduce to something that can actually run. Renaming Choose to
            // Select, when Select realizes nothing either, buys a forwarding pointer to a
            // dead end -- and the Teacher did exactly that, in both directions. Reported
            // as NeedsFirst so the inert target becomes the next thing to learn.
            const canAct = (head, seen) => {
              if (seen.has(head)) return false;
              seen.add(head);
              const unit = api.store.get(head);
              if (!unit) return false;
              if (unit.realizations.length) return true;
              for (const { claim: r } of unit.relations) {
                if (r && r.head === "IsA" && r.args[0] && r.args[0].value && r.args[0].value.head) {
                  if (canAct(r.args[0].value.head, seen)) return true;
                }
              }
              return false;
            };
            const inert = [...new Set([...namesIn(body, new Set())].filter((h) => !canAct(h, new Set())))];
            if (inert.length) {
              rejected.push(api.call("NeedsFirst", api.call("List", ...inert.map((h) => api.call(h)))));
              continue;
            }
            const heads = [];
            (function collect(e) {
              if (!e || !e.head) return;
              heads.push(e.head);
              for (const a of e.args) collect(a.value);
            })(body);
            const missing = [...new Set(heads.filter((h) => !api.store.has(h)))];
            if (missing.length) {
              rejected.push(api.call("NeedsFirst", api.call("List", ...missing.map((h) => api.call(h)))));
              continue;
            }
            api.store.addRealization(identity, {
              pattern, body,
              context: context === undefined ? undefined : context,
              properties: [],
              evaluateArguments: true,
              evaluateResult: false,
            });
            added += 1;
          }
          if (asked.length > RELATION_CAP) {
            rejected.push(api.call("TooMany", asked.length - RELATION_CAP));
          }
          if (rejected.length) {
            return api.call("Saved", api.call(identity), added, api.call("Rejected", ...rejected));
          }
          return api.call("Saved", api.call(identity), added);
        }`),
      }),
    ],
  }),
);
/**
 * Lower-arity declarations, delegating to the full form -- the same idiom Date() uses.
 *
 * A Teacher that runs out of tokens mid-list leaves a declaration salvaged back to its
 * last complete argument, which is often `identity` and `relations` with `realizations`
 * lost off the end. Requiring all three made that a residual, so everything it HAD managed
 * to say was discarded over a field it never got to.
 */
add(
  concept("Concept", {
    realizations: [
      realization({
        pattern: "Concept(identity=$identity, relations=$relations)",
        evaluateArguments: false,
        body: parse("Concept(identity=$identity, relations=$relations, realizations=List())"),
      }),
      realization({
        pattern: "Concept(identity=$identity, realizations=$realizations)",
        evaluateArguments: false,
        body: parse("Concept(identity=$identity, relations=List(), realizations=$realizations)"),
      }),
      realization({
        pattern: "Concept(identity=$identity)",
        evaluateArguments: false,
        body: parse("Concept(identity=$identity, relations=List(), realizations=List())"),
      }),
    ],
  }),
);
add(concept("Saved"));
add(concept("Rejected"));
add(concept("NeedsFirst"));
add(concept("SelfReferential"));
add(concept("TooMany"));
add(concept("Forwarding", { relations: ["IsA(RealizationProperty())"] }));
/** A claim together with the context it holds in, for reporting rather than storing. */
add(concept("In", { relations: ["IsA(Marker())"] }));
add(concept("NotComposed"));
add(concept("Incomplete"));
add(concept("NotComposed"));
add(concept("Incomplete"));
add(concept("InvalidDeclaration"));
add(concept("Missing"));
add(
  concept("Relations", {
    realizations: [
      realization({
        pattern: "Relations($subject)",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const subject = args[0].value;
          if (!subject || !subject.head) return api.call("Unknown");
          const triples = api.relations.of(subject.head)
            .filter((t) => {
              const unit = api.store.get(t.predicate);
              return !(unit?.relations ?? []).some((r) => r.claim.head === "Incidental");
            });
          if (!triples.length) return api.call("NoDescription", subject);
          // Every sense is reported, and a sense-scoped claim says which sense it is.
          // Dropping the ones that do not match would hide a true fact because the asker
          // did not name a context; stating them flat would say a music single is a
          // stretch of time. Carrying the context does neither.
          const described = triples.map((t) =>
            t.context ? api.call("In", t.expr, t.context) : t.expr,
          );
          return api.call("Describes", subject, api.call("List", ...described));
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Evaluation control. All take their arguments unevaluated.
 * ------------------------------------------------------------------ */
add(
  concept("Sequence", {
    realizations: [
      realization({
        pattern: "Sequence(Rest($steps))",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          let last = null;
          for (const a of args) last = await api.evaluate(a.value);
          return last;
        }`),
      }),
    ],
  }),
);

add(
  concept("Let", {
    realizations: [
      realization({
        pattern: "Let($name, $value, $body)",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const [nameArg, valueArg, bodyArg] = args;
          const name = nameArg.value.variable;
          const value = await api.evaluate(valueArg.value);
          const bound = new Map([[name, value]]);
          const substituted = api.substitute(bodyArg.value, bound);
          return await api.evaluate(substituted);
        }`),
      }),
    ],
  }),
);

add(
  concept("If", {
    realizations: [
      realization({
        pattern: "If($condition, $then, $otherwise)",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const test = await api.evaluate(args[0].value);
          const truthy = test === true || (test && test.head === "True");
          return await api.evaluate(truthy ? args[1].value : args[2].value);
        }`),
      }),
    ],
  }),
);

add(
  concept("Try", {
    realizations: [
      realization({
        pattern: "Try($body, $catch)",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          try {
            return await api.evaluate(args[0].value);
          } catch (caught) {
            const failure = caught && caught.value ? caught.value : api.call("ExecutionFailed");
            const handler = args[1].value;
            if (handler && handler.head === "Catch") {
              const name = handler.args[0].value.variable;
              return await api.evaluate(api.substitute(handler.args[1].value, new Map([[name, failure]])));
            }
            return await api.evaluate(handler);
          }
        }`),
      }),
    ],
  }),
);
add(concept("Catch", { relations: ["IsA(Data())"] }));
add(concept("Lambda", { relations: ["IsA(Data())"] }));
add(concept("List", { relations: ["IsA(Collection())"] }));
add(concept("Rest", { relations: ["IsA(Data())"] }));

/* ------------------------------------------------------------------ *
 * State. Cells reach the store through the same interface everything else uses.
 * ------------------------------------------------------------------ */
add(
  concept("Cell", {
    realizations: [
      realization({
        pattern: "Cell($initial)",
        properties: ["Effectful()"],
        body: code(`(args, bindings, api) => api.cells.allocate(args[0].value)`),
      }),
    ],
  }),
);
add(
  concept("Get", {
    realizations: [
      realization({
        pattern: "Get($ref)",
        properties: ["Effectful()"],
        body: code(`(args, bindings, api) => api.cells.read(args[0].value)`),
      }),
    ],
  }),
);
add(
  concept("Set", {
    realizations: [
      realization({
        pattern: "Set($ref, $value)",
        properties: ["Effectful()"],
        body: code(`(args, bindings, api) => api.cells.write(args[0].value, args[1].value)`),
      }),
    ],
  }),
);
add(concept("CellRef", { relations: ["IsA(Data())"] }));

/* ------------------------------------------------------------------ *
 * Failure and outcome. Pure data.
 * ------------------------------------------------------------------ */
add(concept("Failure", { relations: ["IsA(Category())"] }));
for (const f of ["ExecutionFailed", "UnboundVariable", "BudgetExceeded", "Unrealized", "ForeignCode"]) {
  add(concept(f, { relations: ["IsA(Failure())"] }));
}
add(concept("TruthValue", { relations: ["IsA(Category())"] }));
for (const t of ["True", "False", "UnknownTruth"]) {
  add(concept(t, { relations: ["IsA(TruthValue())"] }));
}

/* ------------------------------------------------------------------ *
 * Source markers. Each projection is Lossy, so Describe withholds it and the
 * marker survives into its own description.
 * ------------------------------------------------------------------ */
const projection = (pattern: string, pick: number) =>
  realization({
    pattern,
    context: "Execution()",
    properties: ["Lossy()"],
    evaluateArguments: false,
    body: code(`async (args, bindings, api) => await api.evaluate(args[${pick}].value)`),
  });

add(concept("Correction", { realizations: [projection("Correction($old, $new)", 1)] }));
add(concept("Misspelling", { realizations: [projection("Misspelling($wrote, $meant)", 1)] }));
add(concept("Fuzzy", { realizations: [projection("Fuzzy($x)", 0)] }));
add(concept("Emphasis", { realizations: [projection("Emphasis($x)", 0)] }));
// Aside and Ref have no execution realization at all, deliberately: both should stay
// visible until something resolves them rather than quietly evaluating to anything.
add(concept("Marker", { relations: ["IsA(Category())"] }));
add(concept("Aside", { relations: ["IsA(Marker())"] }));
add(
  concept("Ref", {
    relations: ["IsA(Marker())"],
    realizations: [
      // An unresolved Ref stays residual, deliberately: it should remain visible until
      // something resolves it. Once memory has, the resolved value is what computes.
      realization({
        pattern: "Ref($text, resolvedTo=$value)",
        context: "Execution()",
        properties: ["Lossy()"],
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const found = args.find((a) => a.name === "resolvedTo");
          if (!found) return api.call("Ref", args[0].value);
          const value = found.value;
          // Memory stores what was said as text; read it back as Concepts.
          // A stored answer is already wrapped; pointing at it means pointing at what it
          // answered, not at the wrapper.
          const unwrap = (x) => (x && x.head === "Answer" && x.args.length === 1 ? x.args[0].value : x);
          if (typeof value !== "string") return unwrap(await api.evaluate(value));
          try {
            return unwrap(await api.evaluate(api.parse(value)));
          } catch {
            return value;
          }
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Interrogatives. An interrogative goes where the unknown is.
 * ------------------------------------------------------------------ */
// One realization serves every question word, reached by inheritance. Asking for the
// value of something is the same operation whichever word the message used.
add(
  concept("Interrogative", {
    realizations: [
      realization({
        pattern: "$question",
        context: "Execution()",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          if (!args.length) return api.call("Unknown");
          const subject = args[0].value;
          const value = await api.evaluate(subject);
          // If it computed, answer. If it did not, it is a residual, so describe instead:
          // the graph decides whether a question wants a value or a definition.
          if (api.format(value) !== api.format(subject)) return api.call("Answer", value);
          // It stayed residual, so the question wants a definition rather than a value.
          return await api.evaluate(api.call("Relations", subject), api.call("Describe"));
        }`),
      }),
    ],
  }),
);

for (const q of ["What", "Who", "When", "Where", "Why", "How", "HowMany", "WhichOf"]) {
  add(concept(q, { relations: ["IsA(Interrogative())"] }));
}
add(concept("WhatIs", { relations: ["SynonymOf(What())"] }));

// A yes/no question wants a truth value, not a subject, so it declares its own
// realization locally — which beats the inherited one on distance.
add(
  concept("Whether", {
    relations: ["IsA(Interrogative())"],
    realizations: [
      realization({
        pattern: "Whether($proposition)",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const v = args[0].value;
          if (v === true || (v && v.head === "True")) return api.call("Answer", api.call("True"));
          if (v === false || (v && v.head === "False")) return api.call("Answer", api.call("False"));
          return api.call("Answer", api.call("UnknownTruth"));
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Frames and modifiers.
 * ------------------------------------------------------------------ */
add(concept("Frame", { relations: ["IsA(Category())"] }));
add(concept("Modifier", { relations: ["IsA(Category())"] }));
for (const f of ["Fact", "Do", "Tell"]) add(concept(f, { relations: ["IsA(Frame())"] }));
for (const m of ["Qualify", "Ordinal", "Not"]) add(concept(m, { relations: ["IsA(Modifier())"] }));
add(concept("Result", { relations: ["IsA(Category())"] }));
for (const r of ["Answer", "Describes", "NoDescription", "Readings", "Saved"]) {
  add(concept(r, { relations: ["IsA(Result())"] }));
}
for (const d of ["Text", "Unknown", "Missing", "InvalidDeclaration"]) add(concept(d, { relations: ["IsA(Data())"] }));
add(concept("Data", { relations: ["IsA(Category())"] }));

/* ------------------------------------------------------------------ *
 * Primitives and collections.
 * ------------------------------------------------------------------ */
add(concept("Primitive", { relations: ["IsA(Data())"] }));
add(concept("Collection", { relations: ["IsA(Data())"] }));
add(concept("String", { relations: ["IsA(Primitive())"] }));
add(concept("Boolean", { relations: ["IsA(Primitive())"] }));
add(concept("Object", { relations: ["IsA(Collection())"] }));
add(concept("Pair", { relations: ["IsA(Collection())"] }));
add(
  concept("Number", {
    realizations: [
      realization({
        pattern: "Number($value)",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const v = args[0].value;
          if (typeof v === "number") return v;
          const words = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7,
                          eight:8, nine:9, ten:10, eleven:11, twelve:12, dozen:12,
                          twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70,
                          eighty:80, ninety:90, hundred:100, thousand:1000,
                          million:1000000, billion:1000000000 };
          if (typeof v === "string") {
            const n = words[v.toLowerCase()];
            if (n !== undefined) return n;
            const parsed = Number(v);
            if (Number.isFinite(parsed)) return parsed;
          }
          // Not a number. Handing back the bare word claimed success and let a string
          // reach arithmetic, where it became NaN somewhere far from here. Stay residual.
          return api.call("Number", args[0].value);
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Rendering wraps its subject rather than parameterising it, so Date never
 * learns that formats exist.
 *
 * Formatting NEVER returns a bare string. It returns the same Concept with its
 * rendering carried in `spoken`, because a display string is a field of a value and
 * not a replacement for it. Returning "10:15" cost the next turn its arithmetic: the
 * reference resolved to text, Add saw a string, and the whole thing went residual.
 * ------------------------------------------------------------------ */
add(
  concept("Format", {
    realizations: [
      realization({
        pattern: "Format($subject, $spec)",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const subject = args[0].value;
          const spec = args[1].value;
          const pattern = typeof spec === "string" ? spec : "";
          const wants12 = /12|am|pm/i.test(pattern);

          // Keep every field the subject had and carry the rendering alongside them.
          const withSpoken = (head, source, spoken) => ({
            head,
            args: [
              ...source.args.filter((a) => a.name !== "spoken"),
              { name: "spoken", value: spoken },
            ],
          });
          const named = (e, n) => { const a = e.args.find((x) => x.name === n); return a ? a.value : undefined; };
          const clock = (h24, minute) => {
            const mm = String(minute).padStart(2, "0");
            if (!pattern || wants12) {
              const h = h24 % 12 === 0 ? 12 : h24 % 12;
              return h + ":" + mm + " " + (h24 < 12 ? "AM" : "PM");
            }
            return String(h24).padStart(2, "0") + ":" + mm;
          };

          if (subject && subject.head === "Date") {
            const y = String(named(subject, "year"));
            const m = String(named(subject, "month")).padStart(2, "0");
            const d = String(named(subject, "day")).padStart(2, "0");
            const spoken = (pattern || "YYYY-MM-DD").replace("YYYY", y).replace("MM", m).replace("DD", d);
            return withSpoken("Date", subject, spoken);
          }
          if (subject && subject.head === "Time") {
            const h24 = Number(named(subject, "hour"));
            const minute = Number(named(subject, "minute"));
            if (Number.isFinite(h24) && Number.isFinite(minute)) {
              return withSpoken("Time", subject, clock(h24, minute));
            }
          }
          if (subject && subject.head === "Timestamp") {
            const raw = subject.args[0] ? subject.args[0].value : undefined;
            const when = typeof raw === "string" ? new Date(raw) : new Date();
            if (Number.isNaN(when.getTime())) return api.call("Format", subject, spec);
            const h24 = when.getHours(), minute = when.getMinutes();
            return { head: "Time", args: [
              { name: "hour", value: h24 },
              { name: "minute", value: minute },
              { name: "spoken", value: clock(h24, minute) },
            ]};
          }
          return api.call("Format", subject, spec);
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Allen's interval algebra: how two stretches of time can stand to each other.
 *
 * Thirteen relations, and exactly thirteen. They are jointly exhaustive and pairwise
 * disjoint -- any two intervals stand in one of these and never in two. That closure is
 * why this calculus is still in use while most of qualitative reasoning is not
 * (design/judgment-research.md Part 6): a closed, small, mutually exclusive family
 * composes by table lookup, where an open-ended one accumulates cases that cannot be
 * resolved.
 *
 * Seeded rather than taught, for the same reason arithmetic is. These have exact
 * definitions, and a Teacher grounded in a web search would return the surname Allen, the
 * English word "meets", and a definition of "during" that is merely usable. Where the
 * meaning is exact, stating it is honest and learning it is not.
 *
 * Only Equals is an equivalence. Before, During, Starts and Finishes are transitive but
 * asymmetric, so they order without collapsing -- and Meets and Overlaps are neither,
 * which is what stops a chain of adjacent intervals from becoming one interval.
 * ------------------------------------------------------------------ */
const interval = (name: string, inverse: string, relations: string[] = []) =>
  concept(name, {
    relations: ["IsA(IntervalRelation())", `InverseOf(${inverse}())`, ...relations],
  });

add(concept("IntervalRelation", { relations: ["IsA(Relation())", "IsA(Category())"] }));
add(concept("Interval", { relations: ["IsA(TemporalEntity())"] }));
add(concept("TemporalEntity", { relations: ["IsA(Category())"] }));

// Ordering: transitive, so a chain settles, and asymmetric, so it never closes.
add(interval("Before", "After", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
add(interval("After", "Before", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
// Adjacency: A ends exactly where B starts. NOT transitive -- three intervals in a row
// do not make the first meet the third, and treating them as though they did is how a
// sequence of moments collapses into one.
add(interval("Meets", "MetBy", ["Asymmetric()", "Irreflexive()"]));
add(interval("MetBy", "Meets", ["Asymmetric()", "Irreflexive()"]));
// Partial overlap: also not transitive, for the same reason.
add(interval("Overlaps", "OverlappedBy", ["Asymmetric()", "Irreflexive()"]));
add(interval("OverlappedBy", "Overlaps", ["Asymmetric()", "Irreflexive()"]));
add(interval("Starts", "StartedBy", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
add(interval("StartedBy", "Starts", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
add(interval("During", "Contains", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
add(interval("Contains", "During", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
add(interval("Finishes", "FinishedBy", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
add(interval("FinishedBy", "Finishes", ["Transitive()", "Asymmetric()", "Irreflexive()"]));
// The one equivalence in the family: same start, same end.
add(
  concept("Equals", {
    relations: ["IsA(IntervalRelation())", "Symmetric()", "Transitive()", "InverseOf(Equals())"],
  }),
);

/* ------------------------------------------------------------------ *
 * Deixis and defaults. Today() is deictic: it reads the clock and takes no
 * arguments. Date() is a default: a lower-arity realization delegating to Date(Today()).
 * ------------------------------------------------------------------ */
add(
  concept("CurrentTimestamp", {
    realizations: [
      realization({
        pattern: "CurrentTimestamp()",
        properties: ["Effectful()"],
        body: code(`(args, bindings, api) => api.call("Timestamp", new Date().toISOString())`),
      }),
    ],
  }),
);
add(concept("Timestamp", { relations: ["IsA(Data())"] }));
/** The clock time, as opposed to the calendar date. Deictic, like Today. */
add(
  concept("Time", {
    relations: ["IsA(Deictic())"],
    realizations: [
      realization({
        pattern: "Time()",
        context: "Execution()",
        properties: ["Effectful()"],
        body: code(`(args, bindings, api) => {
          const now = new Date();
          const h24 = now.getHours(), mm = String(now.getMinutes()).padStart(2, "0");
          const h = h24 % 12 === 0 ? 12 : h24 % 12;
          return { head: "Time", args: [
            { name: "hour", value: h24 },
            { name: "minute", value: now.getMinutes() },
            { name: "spoken", value: h + ":" + mm + " " + (h24 < 12 ? "AM" : "PM") },
          ]};
        }`),
      }),
    ],
  }),
);
add(
  concept("Today", {
    relations: ["IsA(Date())"],
    realizations: [
      realization({
        pattern: "Today()",
        context: "Execution()",
        properties: ["Effectful()"],
        body: code(`(args, bindings, api) => {
          const now = new Date();
          const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
          return { head: "Date", args: [
            { name: "year", value: now.getFullYear() },
            { name: "month", value: now.getMonth() + 1 },
            { name: "day", value: now.getDate() },
            { name: "weekday", value: days[now.getDay()] },
          ]};
        }`),
      }),
    ],
  }),
);
add(
  concept("Date", {
    realizations: [
      // The zero-argument form is a default: a lower-arity realization delegating to the
      // fuller one. Defaults need no feature; patterns already match on exact arity.
      realization({ pattern: "Date()", context: "Execution()", body: parse("Date(Today())") }),
      realization({
        pattern: "Date($when)",
        context: "Execution()",
        body: code(`async (args, bindings, api) => args[0].value`),
      }),
    ],
  }),
);
/**
 * Date arithmetic, so a deictic that is computable actually computes.
 *
 * Learning taught Tomorrow what it IS — IsA(TemporalExpression()), InverseOf(Yesterday())
 * — and left it inert, so "what will be the date tomorrow" got a definition instead of a
 * date. Relations say what a thing is; they never say how to do it. Where the doing is
 * expressible from Concepts that already exist, it should be seeded as a composition.
 */
add(
  concept("ShiftDays", {
    realizations: [
      realization({
        pattern: "ShiftDays($date, $days)",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const date = args[0].value, days = args[1].value;
          if (!date || date.head !== "Date" || typeof days !== "number") {
            return api.call("ShiftDays", date, days);
          }
          const get = (n) => { const a = date.args.find((x) => x.name === n); return a ? a.value : undefined; };
          const d = new Date(Number(get("year")), Number(get("month")) - 1, Number(get("day")) + days);
          const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
          return { head: "Date", args: [
            { name: "year", value: d.getFullYear() },
            { name: "month", value: d.getMonth() + 1 },
            { name: "day", value: d.getDate() },
            { name: "weekday", value: names[d.getDay()] },
          ]};
        }`),
      }),
    ],
  }),
);
add(
  concept("DayAfter", {
    relations: ["InverseOf(DayBefore())"],
    realizations: [realization({ pattern: "DayAfter($date)", context: "Execution()", body: parse("ShiftDays($date, 1)") })],
  }),
);
add(
  concept("DayBefore", {
    relations: ["InverseOf(DayAfter())"],
    realizations: [realization({ pattern: "DayBefore($date)", context: "Execution()", body: parse("ShiftDays($date, -1)") })],
  }),
);
add(
  concept("Tomorrow", {
    relations: ["IsA(Date())", "IsA(Deictic())", "InverseOf(Yesterday())"],
    realizations: [realization({ pattern: "Tomorrow()", context: "Execution()", body: parse("DayAfter(Today())") })],
  }),
);
add(
  concept("Yesterday", {
    relations: ["IsA(Date())", "IsA(Deictic())", "InverseOf(Tomorrow())"],
    realizations: [realization({ pattern: "Yesterday()", context: "Execution()", body: parse("DayBefore(Today())") })],
  }),
);
/**
 * Clock arithmetic, the counterpart of ShiftDays. Without it "add 5 hours to it" had no
 * Concept to reach for, so the parser reached for Add, which is numeric, and the whole
 * expression went residual on a time that is not a number.
 */
add(
  concept("ShiftHours", {
    realizations: [
      realization({
        pattern: "ShiftHours($time, $hours)",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const time = args[0].value;
          const raw = args[1].value;
          const hours = typeof raw === "number"
            ? raw
            : raw && raw.head === "Number" && typeof raw.args[0].value === "number"
              ? raw.args[0].value
              : NaN;
          if (!time || time.head !== "Time" || !Number.isFinite(hours)) {
            return api.call("ShiftHours", time, args[1].value);
          }
          const named = (n) => { const a = time.args.find((x) => x.name === n); return a ? a.value : undefined; };
          const h0 = Number(named("hour")), m0 = Number(named("minute"));
          if (!Number.isFinite(h0) || !Number.isFinite(m0)) return api.call("ShiftHours", time, args[1].value);
          const total = (((h0 + hours) % 24) + 24) % 24;
          const mm = String(m0).padStart(2, "0");
          const h12 = total % 12 === 0 ? 12 : total % 12;
          return { head: "Time", args: [
            { name: "hour", value: total },
            { name: "minute", value: m0 },
            { name: "spoken", value: h12 + ":" + mm + " " + (total < 12 ? "AM" : "PM") },
          ]};
        }`),
      }),
    ],
  }),
);
add(
  concept("HourAfter", {
    relations: ["InverseOf(HourBefore())"],
    realizations: [realization({ pattern: "HourAfter($time)", context: "Execution()", body: parse("ShiftHours($time, 1)") })],
  }),
);
add(
  concept("HourBefore", {
    relations: ["InverseOf(HourAfter())"],
    realizations: [realization({ pattern: "HourBefore($time)", context: "Execution()", body: parse("ShiftHours($time, -1)") })],
  }),
);
add(concept("Now", { relations: ["SynonymOf(CurrentTimestamp())", "IsA(Deictic())"] }));
add(concept("Deictic", { relations: ["IsA(Category())"] }));
add(concept("Me", { relations: ["IsA(Deictic())"] }));
add(concept("You", { relations: ["IsA(Deictic())"] }));

/* ------------------------------------------------------------------ *
 * A little arithmetic, so the first end-to-end turn computes something real.
 * ------------------------------------------------------------------ */
const binary = (head: string, op: string) =>
  concept(head, {
    realizations: [
      realization({
        pattern: `${head}($left, $right)`,
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const asNumber = (x) => {
            if (typeof x === "number") return x;
            if (x && x.head === "Number") return asNumber(x.args[0].value);
            return NaN;
          };
          const l = asNumber(args[0].value), r = asNumber(args[1].value);
          if (Number.isNaN(l) || Number.isNaN(r)) return api.call("${head}", args[0].value, args[1].value);
          return ${op};
        }`),
      }),
    ],
  });
add(binary("Multiply", "l * r"));
add(binary("Add", "l + r"));
add(binary("Subtract", "l - r"));
add(binary("GreaterThan", "l > r ? { head: 'True', args: [] } : { head: 'False', args: [] }"));
add(concept("Times", { relations: ["SynonymOf(Multiply())"] }));

add(
  concept("Count", {
    realizations: [
      realization({
        pattern: "Count($needle, $haystack)",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const text = (x) => (typeof x === "string" ? x : x && x.head === "String" ? x.args[0].value : null);
          const needle = text(args[0].value), haystack = text(args[1].value);
          if (needle === null || haystack === null) return api.call("Count", args[0].value, args[1].value);
          return haystack.split(needle).length - 1;
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Self-reference. A message that talks about itself needs a referent for itself, and
 * without one the instruction "use this prompt as a test case" cannot be expressed at all.
 * This was the measured weak spot: long self-referential messages scored 13-43% fidelity
 * at every model size.
 * ------------------------------------------------------------------ */
add(
  concept("Self", {
    realizations: [
      realization({
        pattern: "Self()",
        context: "Execution()",
        body: code(`(args, bindings, api) => {
          const message = api.ambient("message");
          return message === undefined ? api.call("Self") : api.call("Message", message);
        }`),
      }),
    ],
  }),
);
add(concept("Message", { relations: ["IsA(Data())"] }));

/* ------------------------------------------------------------------ *
 * Preserved ambiguity. When context does not resolve which reading is meant, the system
 * may pick, ask, or keep both — and which it does is itself a realization selected by
 * context, so the policy is inspectable rather than hardcoded.
 * ------------------------------------------------------------------ */
add(
  concept("Ambiguous", {
    realizations: [
      // Under Execution the best-supported reading wins: the first that realizes.
      realization({
        pattern: "Ambiguous(Rest($readings))",
        context: "Execution()",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const tried = [];
          for (const a of args) {
            const value = await api.evaluate(a.value);
            if (api.format(value) !== api.format(a.value)) return value;
            tried.push(value);
          }
          // Nothing resolved, so the ambiguity is preserved rather than guessed at.
          return api.call("Ambiguous", ...tried);
        }`),
      }),
      // Under Describe all readings are kept and shown.
      realization({
        pattern: "Ambiguous(Rest($readings))",
        context: "Describe()",
        evaluateArguments: false,
        body: code(`(args, bindings, api) =>
          api.call("Readings", ...args.map((a) => a.value))`),
      }),
    ],
  }),
);
add(concept("Readings"));

/* ------------------------------------------------------------------ *
 * Research, as Concepts. Search results become Concepts with their source attached, so a
 * claim can be traced back to where it came from.
 * ------------------------------------------------------------------ */
add(concept("Source", { relations: ["IsA(Category())"] }));
/**
 * Text assembly, which is what emitting source is made of. Variadic through Rest, so a
 * taught realization can lay out a construct without the grammar needing a list syntax.
 *
 * Its arguments evaluate under the SAME context it was reached in, so a TypeScript
 * realization of If whose body is Text("if (", $c, ") {", $t, "}") emits TypeScript for
 * $c and $t too. Composition is what makes one realization per construct enough.
 */
add(
  concept("Text", {
    relations: ["IsA(Source())"],
    realizations: [
      realization({
        pattern: "Text(Rest($parts))",
        body: code(`(args, bindings, api) => args.map((a) => {
          const v = a.value;
          if (typeof v === "string") return v;
          if (v === null || v === undefined) return "";
          if (typeof v === "number" || typeof v === "boolean") return String(v);
          return api.format(v);
        }).join("")`),
      }),
    ],
  }),
);
add(concept("Web", { relations: ["IsA(Source())"] }));
add(concept("Wikidata", { relations: ["IsA(Source())"] }));
add(concept("SearchResult", { relations: ["IsA(Data())"] }));
add(concept("SearchResults", { relations: ["IsA(Collection())"] }));
add(
  concept("WikidataSearch", {
    relations: ["IsA(Research())"],
    realizations: [
      realization({
        pattern: "WikidataSearch($query)",
        context: "Execution()",
        properties: ["Effectful()"],
        body: code(`async (args, bindings, api) => {
          const text = typeof args[0].value === "string" ? args[0].value
            : args[0].value && args[0].value.head ? args[0].value.head : "";
          const { wikidata, asConcepts } = await import("../research/sources.js");
          return asConcepts(await wikidata(text, 5));
        }`),
      }),
    ],
  }),
);
add(
  concept("WebSearch", {
    relations: ["IsA(Research())"],
    realizations: [
      realization({
        pattern: "WebSearch($query)",
        context: "Execution()",
        properties: ["Effectful()"],
        body: code(`async (args, bindings, api) => {
          const text = typeof args[0].value === "string" ? args[0].value
            : args[0].value && args[0].value.head ? args[0].value.head : "";
          const { web, asConcepts } = await import("../research/sources.js");
          return asConcepts(await web(text, 5));
        }`),
      }),
    ],
  }),
);
add(concept("Research", { relations: ["IsA(Capability())"] }));
add(concept("Capability", { relations: ["IsA(Category())"] }));

/**
 * A SynonymOf relation is the source of truth; the forwarding realization is derived from
 * it, so the same fact is not asserted in two places that can disagree.
 */
/**
 * Give a Concept the forwarding behaviour its SynonymOf relation implies. The relation is
 * the source of truth and this is derived from it, so the fact is asserted once.
 */
/** A realization that only hands the call to another Concept, rather than doing anything. */
const FORWARDING = "Forwarding";

/**
 * Can this Concept actually do something, following forwards to wherever they lead?
 *
 * A forward is not behaviour, it is a pointer at behaviour. Hi forwarded to Hello and
 * Hello forwarded back to Hi -- each looked realized, neither could do anything, and
 * evaluating Hi() ran to the depth budget. SynonymOf is symmetric, so both arrows get
 * derived from one assertion and the cycle builds itself.
 */
function reachesRealBehaviour(store: ConceptStore, identity: string, seen = new Set<string>()): boolean {
  if (seen.has(identity)) return false;
  seen.add(identity);
  const unit = store.get(identity);
  if (!unit) return false;
  for (const r of unit.realizations) {
    if (!declares(r, FORWARDING)) return true;
    const source = codeSource(r.body) ?? "";
    const to = /head: "([A-Za-z0-9_]+)"/.exec(source)?.[1];
    if (to && reachesRealBehaviour(store, to, seen)) return true;
  }
  return false;
}

/**
 * Point one name at another's behaviour. Refused when the target has none of its own to
 * lend, because a pointer at a pointer is not a destination.
 */
export function forwardSynonym(store: ConceptStore, identity: string, target: string): boolean {
  if (target === identity) return false;
  if (!reachesRealBehaviour(store, target, new Set([identity]))) return false;
  store.addRealization(
    identity,
    realization({
      pattern: `${identity}(Rest($args))`,
      evaluateArguments: false,
      // The target is named in the property, so the evaluator can see where a forward
      // goes without reading its source.
      properties: [`${FORWARDING}(${target}())`],
      body: code(`async (args, bindings, api) =>
        await api.evaluate({ head: "${target}", args: args.map((a) => ({ value: a.value })) })`),
    }),
  );
  return true;
}

function deriveSynonymForwarding(store: ConceptStore): number {
  let derived = 0;
  for (const unit of store.all()) {
    if (unit.realizations.length) continue;
    for (const { claim: r } of unit.relations) {
      if (!isCall(r) || r.head !== "SynonymOf") continue;
      const target = r.args[0]?.value;
      if (target === undefined || !isCall(target)) continue;
      if (!forwardSynonym(store, unit.identity, target.head)) continue;
      derived += 1;
      break;
    }
  }
  return derived;
}

export interface SeedReport {
  created: number;
  updated: number;
  relations: number;
  realizations: number;
  synonymsDerived: number;
}

export function seed(store: ConceptStore): SeedReport {
  const report: SeedReport = { created: 0, updated: 0, relations: 0, realizations: 0, synonymsDerived: 0 };
  for (const unit of units) {
    const result = store.seed(unit);
    if (result.created) report.created += 1;
    else if (result.addedRelations || result.addedRealizations) report.updated += 1;
    report.relations += result.addedRelations;
    report.realizations += result.addedRealizations;
  }
  report.synonymsDerived = deriveSynonymForwarding(store);
  return report;
}

export const seedUnits = (): readonly ConceptUnit[] => units;
