/**
 * Reading stamps and the indexes that come with them (memory-spec Part 4.2, 14).
 *
 * A stamp is structural, not semantic (memory-spec Part 4.2): the store writes it and no
 * evaluator rule consults it. Reading one back is therefore an ordinary Concept, exactly
 * the arrangement the trace already has (concept-spec Part 15.1) -- written as a side
 * effect, read as a Concept. `Mentioning`, `Between`, `Stamps`, `RecordedAt` and `SourceOf`
 * are that read side: their bodies do nothing but call the store through `api` and hand
 * back an expression. None of them decide what a mention or a time range *means* --
 * that judgment belongs to whatever composes them.
 *
 * Kept in its own file, separate from `seed.ts`, so a lane building the importer (which
 * touches `seed.ts` itself) does not collide with this one. `seed.ts` calls
 * `memoryIndexUnits()` once, with a single line, and adds what it returns.
 */
import { type Expr, call } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

const units: ConceptUnit[] = [];
const add = (u: ConceptUnit) => void units.push(u);

/**
 * The claims an index found, oriented the same way `Relations` already reports them
 * (concept-spec Part 5.3): a contextual claim wrapped in `In`, since flattening it would
 * claim it holds everywhere it does not.
 */
const AS_LIST = `(entries) => ({
  head: "List",
  args: entries.map((e) => ({
    value: e.relation.context ? { head: "In", args: [{ value: e.relation.claim }, { value: e.relation.context }] } : e.relation.claim,
  })),
})`;

add(
  concept("Mentioning", {
    realizations: [
      realization({
        pattern: "Mentioning($subject)",
        body: code(`(args, bindings, api) => {
          const toList = ${AS_LIST};
          return toList(api.store.mentioning(args[0].value));
        }`),
      }),
    ],
  }),
);

add(
  concept("Between", {
    realizations: [
      realization({
        pattern: "Between($from, $to)",
        body: code(`(args, bindings, api) => {
          // A bound is either the recorded-time string itself, or a Timestamp(iso) reading
          // of it (the shape "Now()" already produces). Anything else cannot be resolved to
          // a moment, so the call stays a residual (concept-spec Part 8.1).
          const iso = (x) => (typeof x === "string" ? x : x && x.head === "Timestamp" ? x.args[0]?.value : undefined);
          const from = iso(args[0].value);
          const to = iso(args[1].value);
          if (from === undefined || to === undefined) return api.call("Between", args[0].value, args[1].value);
          const toList = ${AS_LIST};
          return toList(api.store.between(from, to));
        }`),
      }),
    ],
  }),
);

add(
  concept("Stamps", {
    realizations: [
      realization({
        pattern: "Stamps($seq)",
        body: code(`(args, bindings, api) => {
          const found = api.store.findStamp(args[0].value);
          if (!found) return api.call("Stamps", args[0].value);
          const s = found.stamp;
          return {
            head: "Stamp",
            args: [
              { name: "seq", value: s.seq },
              { name: "recordedAt", value: s.recordedAt },
              ...(s.source === undefined ? [] : [{ name: "source", value: s.source }]),
            ],
          };
        }`),
      }),
    ],
  }),
);

add(
  concept("RecordedAt", {
    realizations: [
      realization({
        pattern: "RecordedAt($seq)",
        body: code(`(args, bindings, api) => {
          const found = api.store.findStamp(args[0].value);
          return found ? found.stamp.recordedAt : api.call("RecordedAt", args[0].value);
        }`),
      }),
    ],
  }),
);

add(
  concept("SourceOf", {
    realizations: [
      realization({
        pattern: "SourceOf($seq)",
        body: code(`(args, bindings, api) => {
          const found = api.store.findStamp(args[0].value);
          if (!found) return api.call("SourceOf", args[0].value);
          return found.stamp.source === undefined ? api.call("Unknown") : found.stamp.source;
        }`),
      }),
    ],
  }),
);

/** The Concepts this file adds, for `seed.ts` to fold into its own list with one line. */
export const memoryIndexUnits = (): readonly ConceptUnit[] => units;
