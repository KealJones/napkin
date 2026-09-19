/**
 * Forgetting (concept-spec Part 13.2).
 *
 * Append-only would otherwise grow without limit, and a brain does not keep every habit it
 * ever formed. The policy is deliberately conservative — a realization is collectible only
 * when all of these hold:
 *
 *   1. another realization covers the same pattern and context, so the capability does not
 *      disappear;
 *   2. it is the older of that pair, or explicitly retired;
 *   3. it has not been selected for a long period.
 *
 * Condition 1 is the safety property: forgetting can lose an alternative, never a
 * capability. The only way to do something is never collected, however old it is.
 *
 * Collection is safe only because the trace records the selected realization by value
 * rather than by reference, so history cannot dangle.
 */
import { format } from "../concept/expression.js";
import type { Realization } from "../concept/unit.js";
import type { ConceptStore } from "./store.js";

export interface ForgetOptions {
  /** How long is long. Default 30 days. */
  unusedForMs?: number;
  /** Report what would go without removing it. */
  dryRun?: boolean;
  now?: number;
}

export interface Forgotten {
  readonly identity: string;
  readonly pattern: string;
  readonly context: string;
  readonly reason: "shadowed" | "retired";
}

const key = (r: Realization): string =>
  `${format(r.pattern)}||${r.context === undefined ? "any" : format(r.context)}`;

export function forget(store: ConceptStore, options: ForgetOptions = {}): Forgotten[] {
  const unusedFor = options.unusedForMs ?? 30 * 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now();
  const collected: Forgotten[] = [];

  for (const unit of store.all()) {
    if (unit.realizations.length < 2) continue;

    // Group by pattern and context: only within a group can one shadow another.
    const groups = new Map<string, number[]>();
    unit.realizations.forEach((r, i) => {
      const k = key(r);
      const list = groups.get(k);
      if (list) list.push(i);
      else groups.set(k, [i]);
    });

    const doomed = new Set<number>();
    for (const [, indexes] of groups) {
      if (indexes.length < 2) continue;
      // The last is the live one; everything before it is shadowed.
      const live = indexes[indexes.length - 1];
      for (const i of indexes) {
        if (i === live) continue;
        const r = unit.realizations[i];
        const selected = store.selectedAt(unit.identity, i);
        const stale = selected === undefined || now - selected > unusedFor;
        if (!stale) continue;
        doomed.add(i);
        collected.push({
          identity: unit.identity,
          pattern: format(r.pattern),
          context: r.context === undefined ? "any" : format(r.context),
          reason: r.retired ? "retired" : "shadowed",
        });
      }
    }

    if (doomed.size && !options.dryRun) {
      store.replaceRealizations(
        unit.identity,
        unit.realizations.filter((_, i) => !doomed.has(i)),
      );
    }
  }
  return collected;
}

/**
 * The same pass flags clusters reaching nothing realizable — an orphan is the actual
 * defect (concept-spec Part 5.3), and this is already walking the graph.
 */
export function orphans(store: ConceptStore, isRealizable: (identity: string) => boolean): string[] {
  return store
    .all()
    .filter((u) => u.realizations.length === 0 && u.relations.length === 0)
    .map((u) => u.identity)
    .filter((id) => !isRealizable(id));
}
