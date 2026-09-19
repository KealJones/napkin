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
import { concept, realization, type ConceptUnit } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);
const meaning = (text: string): Expr => c("Text", text);

const units: ConceptUnit[] = [];
const add = (u: ConceptUnit) => void units.push(u);

/* ------------------------------------------------------------------ *
 * Relation vocabulary. Pure data; the harness never reads these.
 * ------------------------------------------------------------------ */
add(concept("IsA", { relations: ["Transitive()"] }));
add(concept("SynonymOf", { relations: ["Symmetric()", "Transitive()"] }));
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
          for (const r of items(get("relations"))) api.store.addRelation(identity, r);
          api.store.seed({ identity, relations: [], realizations: [] });
          return api.call("Saved", api.call(identity));
        }`),
      }),
    ],
  }),
);
add(concept("Saved"));
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
              return !(unit?.relations ?? []).some((r) => r.head === "Incidental");
            });
          if (!triples.length) return api.call("NoDescription", subject);
          return api.call("Describes", subject, api.call("List", ...triples.map((t) => t.expr)));
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
for (const f of ["ExecutionFailed", "UnboundVariable", "BudgetExceeded", "Unrealized"]) {
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
add(concept("Ref", { relations: ["IsA(Marker())"] }));

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
        body: code(`(args) => {
          const v = args[0].value;
          if (typeof v === "number") return v;
          const words = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7,
                          eight:8, nine:9, ten:10, eleven:11, twelve:12 };
          if (typeof v === "string") {
            const n = words[v.toLowerCase()];
            if (n !== undefined) return n;
            const parsed = Number(v);
            if (Number.isFinite(parsed)) return parsed;
          }
          return args[0].value;
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Rendering wraps its subject rather than parameterising it, so Date never
 * learns that formats exist.
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
          if (!subject || subject.head !== "Date") return api.call("Format", subject, spec);
          const get = (n) => { const a = subject.args.find((x) => x.name === n); return a ? a.value : undefined; };
          const y = String(get("year")), m = String(get("month")).padStart(2, "0"), d = String(get("day")).padStart(2, "0");
          const pattern = typeof spec === "string" ? spec : "YYYY-MM-DD";
          return pattern.replace("YYYY", y).replace("MM", m).replace("DD", d);
        }`),
      }),
    ],
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
add(concept("Now", { relations: ["SynonymOf(CurrentTimestamp())"] }));
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
export function forwardSynonym(store: ConceptStore, identity: string, target: string): void {
  store.addRealization(
    identity,
    realization({
      pattern: `${identity}(Rest($args))`,
      evaluateArguments: false,
      body: code(`async (args, bindings, api) =>
        await api.evaluate({ head: "${target}", args: args.map((a) => ({ value: a.value })) })`),
    }),
  );
}

function deriveSynonymForwarding(store: ConceptStore): number {
  let derived = 0;
  for (const unit of store.all()) {
    if (unit.realizations.length) continue;
    for (const r of unit.relations) {
      if (!isCall(r) || r.head !== "SynonymOf") continue;
      const target = r.args[0]?.value;
      if (target === undefined || !isCall(target)) continue;
      forwardSynonym(store, unit.identity, target.head);
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
