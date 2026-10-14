/**
 * The solver's weights learned from worked examples: for a situation whose answer is known, when
 * the reading ranked first is wrong and a right one was among those read, the weights move toward
 * what the right reading agreed with and away from what the wrong one did (a perceptron, averaged
 * over every step so one example does not swing them). What is learned is kept on the
 * `Situations` Concept as `Weighs("feature", value)`, read over the prior by every solve after.
 */
import { c } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { PRIOR, readings, situationOf, weighWith } from "./situation.js";

export interface Example {
  readonly q: string;
  readonly want: number;
}

export function learnWeights(store: ConceptStore, examples: readonly Example[], epochs = 3, rate = 0.1, budget = 7): { weights: Record<string, number>; right: number[] } {
  const w: Record<string, number> = { ...PRIOR };
  const sum: Record<string, number> = { ...PRIOR };
  let steps = 1;
  const right: number[] = [];
  for (let e = 0; e < epochs; e++) {
    let ok = 0;
    for (const x of examples) {
      weighWith(w);
      const s = situationOf(store, x.q);
      if (!s || s.amounts.length > budget) continue;
      weighWith(w);
      const r = readings(s.amounts, s.asked);
      if (!r?.ranked.length) continue;
      const top = r.ranked[0]!;
      if (Math.abs(top.value - x.want) < 1e-6) {
        ok++;
      } else {
        const target = r.ranked.find((y) => Math.abs(y.value - x.want) < 1e-6);
        if (target) {
          const keys = new Set([...Object.keys(target.features), ...Object.keys(top.features)]);
          for (const k of keys) w[k] = (w[k] ?? 0) + rate * ((target.features[k] ?? 0) - (top.features[k] ?? 0));
        }
      }
      for (const k of Object.keys(w)) sum[k] = (sum[k] ?? 0) + w[k]!;
      steps++;
    }
    right.push(ok);
  }
  const averaged = Object.fromEntries(Object.keys(sum).map((k) => [k, Math.round((sum[k]! / steps) * 1000) / 1000]));
  weighWith(averaged);
  return { weights: averaged, right };
}

/** Keeps learned weights on the Situations Concept, for every solve after. */
export function keepWeights(store: ConceptStore, weights: Record<string, number>, cause?: number): void {
  for (const [k, v] of Object.entries(weights)) if (v !== PRIOR[k]) store.addRelation("Situations", c("Weighs", k, v), undefined, cause);
}
