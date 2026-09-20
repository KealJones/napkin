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
}

export interface ConceptUnit {
  readonly identity: string;
  /** Asserted facts. Authored here, queried through the index (concept-spec Part 5.1.1). */
  readonly relations: readonly Expr[];
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
  parts: { relations?: readonly (Expr | string)[]; realizations?: readonly Realization[] } = {},
): ConceptUnit {
  return {
    identity,
    relations: (parts.relations ?? []).map(asExpr),
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
