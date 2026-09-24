/**
 * A Concept is one self-contained unit of three parts (concept-spec Part 1).
 * There is no gloss and no meaning field: a Concept describes itself through its
 * composition, its relations, or a realization under a Describe() context.
 */
import { type Expr, isCall, named, parse } from "./expression.js";

export interface Realization {
  /** The shape of call this realization handles. */
  readonly pattern: Expr;
  /** The usage context it applies in. Absent means any context. */
  readonly context?: Expr;
  /** Composed Concepts, or Code(...). */
  readonly body: Expr;
  /** Declared properties, e.g. Effectful(), Lossy(). Read generically via Suppresses. */
  readonly properties: readonly Expr[];
  /** Arguments are evaluated before the body unless this is false. */
  readonly evaluateArguments: boolean;
  /** The result is evaluated again when true. */
  readonly evaluateResult: boolean;
  /** Replaces the active context for the body. */
  readonly resultContext?: Expr;
  /** Retired realizations are retained but never selected (concept-spec Part 3.2). */
  readonly retired?: boolean;
  readonly addedAt?: string;
  /** The pack that seeded it, so a pack that no longer has it retires it. */
  readonly seededFrom?: string;
}

/**
 * An asserted fact, and where it holds.
 *
 * The subject is implicit — it is the unit holding the relation — which is usually enough
 * to scope a claim: `Better(Gain(), Loss())` stored on `Dollar` is already about money.
 * It is not enough when the ambiguity IS the subject. `Moment` is a stretch of time and
 * also a band, and both are true, so neither `SynonymOf(Instant())` nor
 * `IsA(MusicSingle())` holds unconditionally. Written into one pile they imply a music
 * single is a stretch of time (`judgment-research.md` Part 14).
 *
 * Absent context means the claim holds in any context, which is what every relation
 * written before this meant.
 */
export interface Relation {
  readonly claim: Expr;
  readonly context?: Expr;
  /**
   * One per assertion, in `seq` order (memory-spec Part 4). Structural, not semantic: the
   * store writes them and no evaluator rule reads them. A relation built by hand has none
   * until the store records it.
   */
  readonly stamps?: readonly Stamp[];
}

/**
 * When the store took a relation in, and what caused it (memory-spec Part 4.2).
 *
 * `seq` is store-wide, strictly increasing and never reused, so a stamp can be pointed at
 * even though a relation cannot be named. `source` is the `seq` of the stamp that caused
 * this one: a belief points at the `Said` it came from.
 */
export interface Stamp {
  readonly seq: number;
  readonly recordedAt: string;
  readonly source?: number;
  /** The pack that seeded it. A relation only packs stamped is theirs to take back. */
  readonly pack?: string;
}

export interface ConceptUnit {
  readonly identity: string;
  /** Asserted facts. Authored here, queried through the index (concept-spec Part 5.1.1). */
  readonly relations: readonly Relation[];
  /** Append-only (concept-spec Part 3.1). */
  readonly realizations: readonly Realization[];
  readonly updatedAt?: string;
}

export interface RealizationInput {
  pattern: Expr | string;
  context?: Expr | string;
  body: Expr;
  properties?: readonly (Expr | string)[];
  evaluateArguments?: boolean;
  evaluateResult?: boolean;
  resultContext?: Expr | string;
}

const asExpr = (e: Expr | string): Expr => (typeof e === "string" ? parse(e) : e);

export const relation = (claim: Expr | string, context?: Expr | string): Relation =>
  context === undefined ? { claim: asExpr(claim) } : { claim: asExpr(claim), context: asExpr(context) };

const asRelation = (r: Expr | string | Relation): Relation =>
  typeof r === "object" && r !== null && "claim" in r ? r : relation(r as Expr | string);

/** Just the claims, for the many readers that do not care where one holds. */
export const claims = (unit: Pick<ConceptUnit, "relations">): Expr[] =>
  unit.relations.map((r) => r.claim);

export function realization(input: RealizationInput): Realization {
  return {
    pattern: asExpr(input.pattern),
    context: input.context === undefined ? undefined : asExpr(input.context),
    body: input.body,
    properties: (input.properties ?? []).map(asExpr),
    evaluateArguments: input.evaluateArguments ?? true,
    evaluateResult: input.evaluateResult ?? false,
    resultContext: input.resultContext === undefined ? undefined : asExpr(input.resultContext),
  };
}

export function concept(
  identity: string,
  parts: {
    relations?: readonly (Expr | string | Relation)[];
    realizations?: readonly Realization[];
  } = {},
): ConceptUnit {
  return {
    identity,
    relations: (parts.relations ?? []).map(asRelation),
    realizations: parts.realizations ?? [],
  };
}

/** Does this realization declare the given property, e.g. Effectful()? */
export const declares = (r: Realization, property: string): boolean =>
  r.properties.some((p) => isCall(p) && p.head === property);

/** A Code(...) body is executable; anything else composes. */
export const isCodeBody = (body: Expr): boolean => isCall(body) && body.head === "Code";

/**
 * What language a Code body is written in.
 *
 * A Code body is a host function, and the spec is deliberate that `Code` is structural and
 * says nothing about a language (`concept-spec.md` Part 17.1). That only holds if the body
 * says which one it is: the same graph is meant to carry a JavaScript implementation and a
 * Rust one for the same pattern, and a host must be able to tell them apart before running
 * either.
 *
 * Absent means JavaScript, because every body written before this existed is JavaScript.
 */
export const codeLanguage = (body: Expr): string => {
  const declared = isCall(body) ? named(body, "language") : undefined;
  return typeof declared === "string" ? declared : "JavaScript";
};

export const codeSource = (body: Expr): string | undefined => {
  const source = named(body, "source");
  return typeof source === "string" ? source : undefined;
};
