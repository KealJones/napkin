/**
 * A usage context is an unordered set of facets (concept-spec Part 7.1).
 *
 * Facets are unordered because describing is a mode and dog-walking is a situation, and
 * neither is a parameter of the other. Nesting them would force an arbitrary order, and
 * two realizations nesting differently would silently never match the same context.
 */
import { type Expr, c, isCall } from "../concept/expression.js";
import { type Bindings, match, specificity } from "../concept/match.js";

export const CONTEXT = "Context";
export const EMPTY: Expr = c(CONTEXT);

/** A single facet is not wrapped; Context(...) appears only for two or more. */
export function facets(context: Expr | undefined): Expr[] {
  if (context === undefined) return [];
  if (isCall(context) && context.head === CONTEXT) return context.args.map((a) => a.value);
  return [context];
}

export function contextOf(items: Expr[]): Expr {
  return items.length === 1 ? items[0] : c(CONTEXT, ...items);
}

/** Facets compose additively: producing a description keeps the situation it describes. */
export function withFacet(context: Expr | undefined, facet: Expr): Expr {
  const current = facets(context);
  if (current.some((f) => JSON.stringify(f) === JSON.stringify(facet))) return contextOf(current);
  return contextOf([...current, facet]);
}

export interface ContextMatch {
  readonly ok: boolean;
  /** How many facets the pattern constrains. More is more specific. */
  readonly facetCount: number;
  /** Structural depth of the matched facets, the secondary ordering. */
  readonly depth: number;
}

/**
 * A realization's context pattern matches when every facet it names matches some active
 * facet. Active facets the pattern does not mention are simply unconstrained.
 */
export function matchContext(
  pattern: Expr | undefined,
  active: Expr | undefined,
  bindings: Bindings,
): ContextMatch {
  const wanted = facets(pattern);
  if (wanted.length === 0) return { ok: true, facetCount: 0, depth: 0 };
  const available = facets(active);
  let depth = 0;
  for (const w of wanted) {
    const hit = available.find((a) => {
      const probe = new Map(bindings);
      if (!match(w, a, probe)) return false;
      for (const [k, val] of probe) bindings.set(k, val);
      return true;
    });
    if (!hit) return { ok: false, facetCount: 0, depth: 0 };
    depth += specificity(w);
  }
  return { ok: true, facetCount: wanted.length, depth };
}

/**
 * Facets that admit only realizations declared for them: under `Hearing()`, a word hears,
 * and nothing it would do elsewhere runs ("add" must not add). A facet is one by holding
 * `Exclusive()`, so the evaluator never learns which facets those are.
 */
export function exclusiveFacets(active: Expr | undefined, relationsOf: (identity: string) => Expr[]): Set<string> {
  const out = new Set<string>();
  for (const facet of facets(active)) {
    if (isCall(facet) && relationsOf(facet.head).some((r) => isCall(r) && r.head === "Exclusive")) out.add(facet.head);
  }
  return out;
}

/**
 * Properties the active context suppresses. The rule is generic over whatever property is
 * named, so the evaluator never learns that Describe, Effectful, or Lossy exist
 * (concept-spec Part 4.0).
 */
export function suppressedProperties(
  active: Expr | undefined,
  relationsOf: (identity: string) => Expr[],
): Set<string> {
  const out = new Set<string>();
  for (const facet of facets(active)) {
    if (!isCall(facet)) continue;
    for (const r of relationsOf(facet.head)) {
      if (isCall(r) && r.head === "Suppresses") {
        const target = r.args[0]?.value;
        if (target !== undefined && isCall(target)) out.add(target.head);
      }
    }
  }
  return out;
}
