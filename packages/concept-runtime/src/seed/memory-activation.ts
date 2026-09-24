/**
 * memory-spec build step 7: the `Activation` Concept (design/memory-spec.md Part 10.1,
 * Part 10.2; emergent-judgment-plan.md Part 3.3, section 7).
 *
 * One Concept, two terms: the formula is computed generically in `runtime/activation.ts`,
 * and what it is tuned by lives here, as relations, so how fast things fade and when they go
 * dormant is edited in the graph rather than in host code (Part 13, the privilege test). A
 * later assertion of the same parameter shadows the seeded one, the way a newer realization
 * shadows an older one, since seeding is additive and never overwrites an edit.
 */
import { concept, type ConceptUnit } from "../concept/unit.js";
import { ACTIVATION_DEFAULTS } from "../runtime/activation.js";

export function memoryActivationUnits(): ConceptUnit[] {
  return [
    concept("Activation", {
      relations: Object.entries(ACTIVATION_DEFAULTS).map(([name, value]) => `${name}(${value})`),
    }),
  ];
}
