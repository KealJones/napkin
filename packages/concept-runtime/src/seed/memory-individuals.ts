/**
 * memory-spec build step 3: the machinery an individual is minted through
 * (design/memory-spec.md Part 3.2, Part 6.1, Part 13, Part 18 step 3).
 *
 * Kept out of `seed.ts`'s own list so this lane and a sibling lane (the indexes, memory-spec
 * Part 9.1) can both add seed Concepts without touching the same array.
 *
 * Only the machinery. Nothing here decides WHEN something earns an identity (Part 6.2) --
 * that policy is the next wave, a realization on `Believe` this file does not add.
 */
import { call, type Expr } from "../concept/expression.js";
import { concept, realization, type ConceptUnit } from "../concept/unit.js";

const code = (source: string): Expr => call("Code", [{ name: "source", value: source }]);

export function memoryIndividualUnits(): ConceptUnit[] {
  return [
    /**
     * `Mint(base)`, exactly as unprivileged as `Cell` (memory-spec Part 3.2): its body
     * reaches the host allocator through `api` and returns the fresh identity, nothing
     * more. It does not assert `IsA` or `Named` on what it minted -- the caller does that
     * with `api.store.addRelation(...)`, sourced from `api.trace.cause`, the same way a
     * declared game's realization would add `IsA(Chess())` and `Players(...)` as two
     * separate relations after minting `Game_7` (Part 7.1). Keeping Mint to allocation
     * alone means it needs no opinion about what an individual's first relations should be,
     * which is exactly the opinion this build step is not supposed to have yet.
     *
     * `base` is either a bare string (the name, when one is already known) or a nullary
     * Concept (its kind, when it is not) -- the same choice memory-spec Part 3.2 leaves to
     * whoever mints.
     */
    concept("Mint", {
      realizations: [
        realization({
          pattern: "Mint($base)",
          properties: ["Effectful()"],
          body: code(`(args, bindings, api) => {
            const base = args[0].value;
            const name = typeof base === "string" ? base : (base && base.head) || "Thing";
            return api.call(api.store.mint(name));
          }`),
        }),
      ],
    }),

    /**
     * A wrong merge is repaired without deleting anything (Part 6.5): `Greg_2` is minted,
     * `DistinctFrom(Greg_1())` is asserted on it, and the misattributed relations move.
     * Seeded here so the relation exists to assert; the repair itself -- finding what was
     * misattributed and moving it -- is the merge-repair automation this build step
     * explicitly leaves undone.
     *
     * `Symmetric()` because two things distinct from one another is one fact, not two: the
     * existing symmetric-relation derivation (`store/relations.ts`) gives `Greg_1` the
     * inverse for free the same way it does for any other symmetric relation.
     */
    concept("DistinctFrom", { relations: ["Symmetric()"] }),
  ];
}
