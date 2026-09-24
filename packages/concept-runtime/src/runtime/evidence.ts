/**
 * Evidence: the trace, read as a corpus (emergent-judgment-plan.md Part 3.1, Phase 0/1).
 *
 * Loaded once per process and kept in memory, the trace only grows by appending, so there
 * is no reason to re-parse it before every selection (Phase 0, "cached per process").
 * `append` keeps a freshly written turn's events in the same cache instead of re-reading
 * the file.
 *
 * Blame stays narrow (concept-spec Part 9.4): only tie-broken selections are scored here.
 * A selection specificity already decided uniquely made no choice, so there is nothing for
 * an outcome to teach it.
 *
 * Design decision (Phase 1, "the host must not learn a seventh identity"): tier 3 is
 * scored as a structural property of past evaluations, the same way recency already was,
 * rather than routed through a realization reached via the universal parent. A realization
 * would need `Evidence` or `Score` to mean something to the loop, which is the seventh
 * identity the spec forbids (concept-spec Part 2.1, Part 17.1). Computing it in the host,
 * generically over `(realizationHash, context, outcome)` with no Concept name in sight,
 * keeps the loop at six. The minimum-evidence threshold is a single constant below rather
 * than a relation on some Concept, because nothing yet needs it to vary by identity; if that
 * changes, reading it off a relation is a small, localized change to this one file.
 */
import { format, parse, type Expr } from "../concept/expression.js";
import { facets } from "./context.js";
import { followUpSignal } from "./turn-signal.js";
import { readTrace, toStored, type StoredTraceEvent } from "../store/traces.js";
import type { TraceEvent } from "./trace.js";
import type { ConceptStore } from "../store/store.js";

/**
 * How many recorded, tie-broken selections at one facet-subset level count as enough to
 * trust (Phase 1, "min-evidence threshold per level"). One constant for every level: it is
 * simpler than sourcing it from relations on a Concept, and nothing here needs it to vary
 * yet (see the design decision above).
 */
const MIN_EVIDENCE = 2;

/** Facet sets are unordered (concept-spec Part 7.1), so the key sorts before joining. */
const contextKey = (fs: readonly Expr[]): string => fs.map(format).sort().join("|");

/** Every subset of `active`, most specific (largest) first. Facet counts are small in
 * practice; a realization naming a dozen facets would already be unreadable. */
function subsetsBySize(active: readonly Expr[]): Expr[][] {
  const n = Math.min(active.length, 12);
  const subsets: { size: number; items: Expr[] }[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const items: Expr[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) items.push(active[i]);
    subsets.push({ size: items.length, items });
  }
  return subsets.sort((a, b) => b.size - a.size).map((s) => s.items);
}

export class EvidenceStore {
  /** Every stored event, for the `Evidence(...)` Concept to query directly (Phase 0 item 3). */
  private readonly events: StoredTraceEvent[] = [];
  /** Tie-broken events only, indexed by realization hash, for tier-3 scoring. */
  private readonly byHash = new Map<string, StoredTraceEvent[]>();

  constructor(initial: readonly StoredTraceEvent[] = []) {
    for (const e of initial) this.index(e);
  }

  static fromFile(path: string): EvidenceStore {
    return new EvidenceStore(readTrace(path));
  }

  private index(e: StoredTraceEvent): void {
    this.events.push(e);
    if (!e.tieBroken || e.realizationHash === null || e.outcome === "running") return;
    const list = this.byHash.get(e.realizationHash) ?? [];
    list.push(e);
    this.byHash.set(e.realizationHash, list);
  }

  /** A freshly written turn's events, kept without re-reading the file. */
  append(events: readonly TraceEvent[]): void {
    for (const e of events) this.index(toStored(e));
  }

  /** Every stored event, oldest first, what `Evidence(...)` reads through `api.events`. */
  all(): readonly StoredTraceEvent[] {
    return this.events;
  }

  /**
   * Net support for this realization in this context: back off from the most specific
   * facet subset toward the empty one until a level has at least `MIN_EVIDENCE` selections
   * (Katz back-off, emergent-judgment-plan.md Part 3.5). `undefined` means no level had
   * enough, the caller falls back to recency, exactly as tier 3 always did.
   */
  score(hash: string, active: readonly Expr[], store: ConceptStore): number | undefined {
    const events = this.byHash.get(hash);
    if (!events || events.length === 0) return undefined;
    for (const subset of subsetsBySize(active)) {
      const key = contextKey(subset);
      const matching = events.filter((e) => contextKey(facets(parse(e.useContext))) === key);
      if (matching.length >= MIN_EVIDENCE) {
        return matching.reduce((sum, e) => sum + signOf(e, store), 0);
      }
    }
    return undefined;
  }
}

/**
 * Concept-spec Part 9.4's signal table has no positive counterpart to "the realization
 * failed, or produced a residual", success is not itself scored, only breakage is. That
 * keeps this a detector of bad choices, not a store of value verdicts (Part 5 guardrail):
 * a realization nobody ever pushed back on stays at 0, indistinguishable from one with no
 * evidence at all, which is exactly right, there is nothing yet to prefer it FOR.
 *
 * A grounded failure and a weak implicit negative (the next turn's retry or rejection) are
 * both counted, at equal weight: this is deliberately generous to the weak signal, because
 * without it a realization that never technically errors could never be corrected away
 * from, no matter how many times the user asked again.
 */
function signOf(e: StoredTraceEvent, store: ConceptStore): number {
  let value = e.outcome === "residual" || e.outcome === "failure" ? -1 : 0;
  if (e.saidSeq !== null && followUpSignal(store, e.saidSeq) === "negative") value -= 1;
  return value;
}

const caches = new Map<string, EvidenceStore>();

/** One `EvidenceStore` per trace path per process (Phase 0, "cached per process"). */
export function evidenceStoreFor(path: string): EvidenceStore {
  let store = caches.get(path);
  if (!store) {
    store = EvidenceStore.fromFile(path);
    caches.set(path, store);
  }
  return store;
}

/** Test-only: forget a cached store, so a fresh read of the same path is not stale. */
export function resetEvidenceCache(path?: string): void {
  if (path === undefined) caches.clear();
  else caches.delete(path);
}
