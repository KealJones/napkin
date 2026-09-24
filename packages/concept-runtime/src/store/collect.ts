/**
 * Collection by age (memory-spec Part 10.3, Part 10.4).
 *
 * This is the second, generic half of collection, alongside the realization pass already
 * in `forget.ts`. Both are structural host machinery, not domain policy: they read what
 * every relation and stamp already carries (a claim's own `Enduring()` declaration, a
 * stamp's `source`, a `Consolidation` another pass wrote) and never invent a rule about a
 * specific Concept.
 *
 * A stamp on an occurrent relation is collectible only when every one of these holds
 * (Part 10.3's table):
 *
 *   1. long dormant;
 *   2. covered by a consolidated fact (Part 11), so the evidence survives distilled even
 *      once the raw occurrence is gone;
 *   3. not the source of any live stamp (safety property 3);
 *   4. not on an open individual (safety property 4).
 *
 * An individual is collectible only when closed, long dormant, holding no enduring fact
 * beyond its identifying ones (safety property 2: a belief is never collected by age), and
 * mentioned by nothing live.
 *
 * Enduring relations are never inspected here at all — Part 10.3 is explicit that they are
 * never collected by age, and that is exactly the check `isEnduring` exists to make.
 */
import { type Expr, c, format, isCall } from "../concept/expression.js";
import type { Relation, Stamp } from "../concept/unit.js";
import { ConceptStore, objectKey } from "./store.js";

export interface CollectOptions {
  /** How long is long. Default 30 days, the same default `forget.ts` uses. */
  dormantForMs?: number;
  /** Report what would go without removing it. */
  dryRun?: boolean;
  now?: number;
}

export interface CollectedStamp {
  readonly what: "stamp";
  readonly identity: string;
  readonly claim: string;
  readonly seq: number;
}

export interface CollectedIndividual {
  readonly what: "individual";
  readonly identity: string;
}

export type Collected = CollectedStamp | CollectedIndividual;

/**
 * Dormancy proxy (memory-spec Part 10.1, Part 10.2): age since a stamp was recorded. A
 * sibling lane is building `Activation`, the real measure Part 10.1 wants; this is
 * deliberately the only place that knows the proxy, so swapping it in later touches one
 * function, not every call site.
 */
function isStale(recordedAt: string, now: number, dormantForMs: number): boolean {
  return now - Date.parse(recordedAt) > dormantForMs;
}

function isEnduring(store: ConceptStore, head: string): boolean {
  return (store.get(head)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "Enduring");
}

/** Every kind an individual reaches through `IsA`, direct or transitive. */
function kindsOf(store: ConceptStore, identity: string): string[] {
  const seen = new Set<string>([identity]);
  const queue = [identity];
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of store.asSubject(id)) {
      if (t.predicate !== "IsA") continue;
      const key = objectKey(t.object);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      queue.push(key);
    }
  }
  return out;
}

/**
 * Open when the individual's kind defines an ending and nothing has closed it yet
 * (memory-spec Part 10.3's "not on an open individual", Part 14's `Ended(how)`). Read
 * generically off relations rather than any specific process's shape, since the processes
 * lane (folded state, `Retracts`, resuming) is a sibling build step that has not landed
 * yet: whatever kind it seeds only has to declare `DefinesEnding()` on itself for this to see it.
 */
function isOpen(store: ConceptStore, identity: string): boolean {
  const unit = store.get(identity);
  if (!unit) return false;
  const ended = unit.relations.some((r) => isCall(r.claim) && r.claim.head === "Ended");
  if (ended) return false;
  const definesEnding = (id: string) => (store.get(id)?.relations ?? []).some((r) => isCall(r.claim) && r.claim.head === "DefinesEnding");
  return [identity, ...kindsOf(store, identity)].some(definesEnding);
}

/** Every `source` a live stamp still points at, so what feeds it is never collected. */
function liveSources(store: ConceptStore): Set<number> {
  const out = new Set<number>();
  for (const unit of store.all()) {
    for (const r of unit.relations) {
      for (const s of r.stamps ?? []) if (s.source !== undefined) out.add(s.source);
    }
  }
  return out;
}

/**
 * `Said` stores the whole parse, mood included (`memory/conversations.ts`), but
 * `Consolidate` (`seed/memory-consolidate.ts`) records the unwrapped clause it actually
 * matched on. Unwrapping the same way here is what lets a `Said` relation's own claim be
 * compared against a `Consolidation`'s at all; naming `Said` is the same precedent
 * `seed/memory-forget.ts` already sets for structural host code.
 */
function contentOf(claim: Expr): Expr {
  if (!isCall(claim) || claim.head !== "Said") return claim;
  const content = claim.args[1]?.value;
  if (!isCall(content)) return claim;
  return content.head === "Mood" && content.args.length === 2 ? content.args[1].value : content;
}

/** Is some `Consolidation` relation's recorded content this exact claim (Part 11)? */
function coveredByConsolidation(store: ConceptStore, claim: Expr): boolean {
  const key = format(contentOf(claim));
  return store.all().some((u) =>
    u.relations.some((r) => isCall(r.claim) && r.claim.head === "Consolidation" && format(r.claim.args[0]?.value as Expr) === key),
  );
}

/** A relation's stamps that are not already collected in this pass — dry run's "what if". */
function remaining(r: Relation, doomed: ReadonlySet<number>): readonly Stamp[] {
  return (r.stamps ?? []).filter((s) => !doomed.has(s.seq));
}

export function collect(store: ConceptStore, options: CollectOptions = {}): Collected[] {
  const dormantForMs = options.dormantForMs ?? 30 * 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now();
  const sources = liveSources(store);
  const out: Collected[] = [];

  // Stamps on occurrent relations.
  const doomed = new Set<number>();
  for (const unit of store.all()) {
    if (isOpen(store, unit.identity)) continue; // safety property 4
    for (const r of unit.relations) {
      if (!isCall(r.claim) || isEnduring(store, r.claim.head)) continue; // safety property 2
      if (!coveredByConsolidation(store, r.claim)) continue;
      for (const s of r.stamps ?? []) {
        if (sources.has(s.seq)) continue; // safety property 3
        if (!isStale(s.recordedAt, now, dormantForMs)) continue;
        doomed.add(s.seq);
        out.push({ what: "stamp", identity: unit.identity, claim: format(r.claim), seq: s.seq });
      }
    }
  }

  // Individuals: closed, long dormant, nothing beyond identity, unmentioned. Computed
  // against the view collection above would leave, so a dry run reports the same thing a
  // commit would produce, rather than one call behind it.
  const IDENTIFYING = new Set(["IsA", "Named"]);
  for (const unit of store.all()) {
    if (isOpen(store, unit.identity)) continue;
    const stampsLeft = unit.relations.flatMap((r) => remaining(r, doomed));
    if (!stampsLeft.length) continue; // nothing recorded is not "long dormant", it is unborn
    const last = Math.max(...stampsLeft.map((s) => Date.parse(s.recordedAt)));
    if (!isStale(new Date(last).toISOString(), now, dormantForMs)) continue;
    const hasOtherEnduring = unit.relations.some(
      (r) => isCall(r.claim) && !IDENTIFYING.has(r.claim.head) && isEnduring(store, r.claim.head) && remaining(r, doomed).length,
    );
    if (hasOtherEnduring) continue;
    const mentioned = store.mentioning(c(unit.identity)).some((m) => m.identity !== unit.identity);
    if (mentioned) continue;
    out.push({ what: "individual", identity: unit.identity });
  }

  if (options.dryRun) return out;
  if (doomed.size) store.collect(doomed);
  for (const item of out) if (item.what === "individual") store.forgetConcept(item.identity);
  return out;
}
