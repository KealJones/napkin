/**
 * Choosing among competing realizations (concept-spec Part 9).
 *
 * Order:
 *   1. where the realization is declared — local beats inherited, nearer ancestor beats
 *      farther. A Concept's own declarations are statements about itself; an inherited
 *      realization is a statement about a category.
 *   2. context specificity — facet count, then structural depth of the matched facets.
 *   3. recency, standing in for success evidence, which is not yet recorded.
 *
 * Specificity must dominate statistics, or a frequently succeeding realization captures a
 * Concept and answers in contexts it was never meant for.
 */
import { type Expr, type Call, isCall } from "../concept/expression.js";
import { type Bindings, match } from "../concept/match.js";
import { declares, type ConceptUnit, type Realization } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";
import { matchContext } from "./context.js";

export interface Candidate {
  readonly realization: Realization;
  readonly owner: string;
  readonly distance: number;
  readonly facetCount: number;
  readonly contextDepth: number;
  readonly order: number;
  readonly bindings: Bindings;
}

/** The Concept and its IsA ancestors, nearest first, with a visited set for cycles. */
export function lineage(store: ConceptStore, identity: string, limit = 16): ConceptUnit[] {
  const out: ConceptUnit[] = [];
  const seen = new Set<string>();
  let frontier = [identity];
  while (frontier.length && out.length < limit) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const unit = store.get(id);
      if (unit) out.push(unit);
      for (const r of unit?.relations ?? []) {
        if (isCall(r) && r.head === "IsA") {
          const parent = r.args[0]?.value;
          if (parent !== undefined && isCall(parent)) next.push(parent.head);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export function candidates(
  store: ConceptStore,
  target: Call,
  context: Expr | undefined,
  suppressed: Set<string>,
): Candidate[] {
  const found: Candidate[] = [];
  const chain = lineage(store, target.head);

  chain.forEach((unit, distance) => {
    unit.realizations.forEach((realization, order) => {
      if (realization.retired) return;
      if (realization.properties.some((p) => isCall(p) && suppressed.has(p.head))) return;

      const bindings: Bindings = new Map();
      if (!match(realization.pattern, target, bindings)) return;
      const ctx = matchContext(realization.context, context, bindings);
      if (!ctx.ok) return;

      found.push({
        realization,
        owner: unit.identity,
        distance,
        facetCount: ctx.facetCount,
        contextDepth: ctx.depth,
        order,
        bindings,
      });
    });
  });

  found.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.facetCount - a.facetCount ||
      b.contextDepth - a.contextDepth ||
      b.order - a.order, // newer shadows older with the same pattern and context
  );
  return found;
}

export const bestCandidate = (
  store: ConceptStore,
  target: Call,
  context: Expr | undefined,
  suppressed: Set<string>,
): Candidate | undefined => candidates(store, target, context, suppressed)[0];

/**
 * Two candidates at the same distance with the same facet count and depth, but different
 * facets, are genuinely incomparable (concept-spec Part 9.3). No facet priority order is
 * imposed; the ambiguity is reported so it can be seen.
 */
export function incomparable(found: Candidate[]): boolean {
  if (found.length < 2) return false;
  const [a, b] = found;
  return (
    a.distance === b.distance &&
    a.facetCount === b.facetCount &&
    a.contextDepth === b.contextDepth &&
    a.facetCount > 0
  );
}

export { declares };
