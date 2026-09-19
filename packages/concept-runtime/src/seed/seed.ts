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
for (const p of ["Symmetric", "Asymmetric", "Transitive", "Reflexive", "Irreflexive", "Functional", "Incidental"]) {
  add(concept(p));
}
// Machinery relations are not led with in a summary; interest is a property of the
// question, so this is a soft default and never a prohibition.
for (const p of ["SynonymOf", "Suppresses", "Symmetric", "Transitive", "InverseOf"]) {
  add(concept(p, { relations: ["Incidental()"] }));
}

/* ------------------------------------------------------------------ *
 * Realization properties, read generically through Suppresses.
 * ------------------------------------------------------------------ */
add(concept("Effectful"));
add(concept("Lossy"));
add(concept("Pure"));
add(concept("Suppresses"));

/* ------------------------------------------------------------------ *
 * Context facets.
 * ------------------------------------------------------------------ */
add(concept("Execution"));
add(concept("Teaching"));
add(concept("Lexical"));
add(concept("JavaScript"));
add(concept("Rust"));
add(
  concept("Describe", {
    relations: ["Suppresses(Effectful())", "Suppresses(Lossy())"],
  }),
);

/* ------------------------------------------------------------------ *
 * The universal parent. Its one describing realization is what answers
 * "what is chess" for any Concept with relations but no composition.
 * ------------------------------------------------------------------ */
add(
  concept("Concept", {
    realizations: [
      realization({
        pattern: "$subject",
        context: "Describe()",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const subject = bindings.get("subject");
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
add(concept("Catch"));
add(concept("Lambda"));
add(concept("List"));
add(concept("Rest"));

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
add(concept("CellRef"));

/* ------------------------------------------------------------------ *
 * Failure and outcome. Pure data.
 * ------------------------------------------------------------------ */
for (const f of ["ExecutionFailed", "UnboundVariable", "BudgetExceeded", "Unrealized", "UnknownTruth", "True", "False"]) {
  add(concept(f));
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
add(concept("Aside"));
add(concept("Ref"));

/* ------------------------------------------------------------------ *
 * Interrogatives. An interrogative goes where the unknown is.
 * ------------------------------------------------------------------ */
for (const q of ["What", "Who", "When", "Where", "Why", "How", "HowMany", "WhichOf", "Whether"]) {
  add(concept(q));
}
add(concept("WhatIs", { relations: ["SynonymOf(What())"] }));

// What(x) asks for the value of x: evaluate it. If x has no execution realization it goes
// residual and describes instead — the graph decides, not the parse.
add(
  concept("What", {
    realizations: [
      realization({
        pattern: "What($subject)",
        context: "Execution()",
        evaluateArguments: false,
        body: code(`async (args, bindings, api) => {
          const subject = args[0].value;
          const value = await api.evaluate(subject);
          if (api.format(value) !== api.format(subject)) return api.call("Answer", value);
          return await api.evaluate(api.call("Concept", subject), api.call("Describe"));
        }`),
      }),
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * Frames and modifiers.
 * ------------------------------------------------------------------ */
for (const f of ["Fact", "Do", "Tell", "Qualify", "Ordinal", "Not", "Answer", "Text", "Describes", "NoDescription", "Unknown"]) {
  add(concept(f));
}

/* ------------------------------------------------------------------ *
 * Primitives and collections.
 * ------------------------------------------------------------------ */
add(concept("String"));
add(concept("Boolean"));
add(concept("Object"));
add(concept("Pair"));
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
add(concept("Timestamp"));
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
add(concept("Me"));
add(concept("You"));

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

/**
 * A SynonymOf relation is the source of truth; the forwarding realization is derived from
 * it, so the same fact is not asserted in two places that can disagree.
 */
function deriveSynonymForwarding(store: ConceptStore): number {
  let derived = 0;
  for (const unit of store.all()) {
    for (const r of unit.relations) {
      if (!isCall(r) || r.head !== "SynonymOf") continue;
      const target = r.args[0]?.value;
      if (target === undefined || !isCall(target)) continue;
      if (unit.realizations.length) continue;
      store.addRealization(
        unit.identity,
        realization({
          pattern: `${unit.identity}(Rest($args))`,
          evaluateArguments: false,
          body: code(`async (args, bindings, api) =>
            await api.evaluate({ head: "${target.head}", args: args.map((a) => ({ value: a.value })) })`),
        }),
      );
      derived += 1;
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
