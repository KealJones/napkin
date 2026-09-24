/**
 * Activation: how live a Concept is right now (memory-spec Part 10.1,
 * emergent-judgment-plan.md Part 3.3). One Concept, two terms, ACT-R's
 * A_i = B_i + sum over j of W_j * S_ji:
 *
 * - **base level** `B_i = ln(sum of t^-d)` over every use of `i`, where a use is a stamp on a
 *   relation it holds or that mentions it (each assertion is a use, Part 4.3), or a trace
 *   event that read it (a selection or a retrieval), and `t` is seconds since that use;
 * - **spread** from a set of source Concepts, over relations and co-usage (Concepts in the
 *   same successful turn of the stored trace), gated by relation contexts, and normalised by
 *   fan-out, `S_ji = S - ln(fan_j)`, so a hub that touches everything passes on nothing.
 *
 * Design decision, following `evidence.ts`: the formula is computed here, generically over
 * stamps, indexes and trace events, with no semantic Concept named. Its numbers are not:
 * they are relations on the `Activation` Concept (`packs/memory.ncon`), read on every
 * call, so changing how fast things fade is editing the graph, not this file (Part 13). A
 * Code body cannot share a host function, and pronoun resolution runs outside evaluation,
 * so putting the formula itself in a realization would mean two copies of it.
 *
 * Derived, never stored (Part 10.1, "needs no new store"): what depends only on the graph is
 * cached per store until its next write, what depends on the trace until it grows.
 */
import { c, isCall, walk, type Expr } from "../concept/expression.js";
import type { Relation } from "../concept/unit.js";
import { mentionKey, type ConceptStore } from "../store/store.js";
import type { StoredTraceEvent } from "../store/traces.js";
import { matchContext } from "./context.js";

/**
 * The defaults the seed writes onto `Activation`, and what an unseeded store falls back to.
 * `Decay` is ACT-R's d. `Strength` is S, the most one hop can pass on. Below `DormantBelow` a
 * thing is dormant (Part 10.2): with d = 0.5, one use about two weeks ago. `Budget` is how
 * many Concepts spreading may expand.
 */
export const ACTIVATION_DEFAULTS = { Decay: 0.5, Strength: 2, DormantBelow: -7, Budget: 64 } as const;

export type ActivationParameters = { -readonly [K in keyof typeof ACTIVATION_DEFAULTS]: number };

export interface ActivationOptions {
  /** Milliseconds since the epoch. Defaults to now. */
  readonly now?: number;
  /** Stored trace events, for reads and co-usage (`api.events`, `evidenceStoreFor`). */
  readonly events?: readonly StoredTraceEvent[];
  /** The active context. A relation holding only in some context spreads only there. */
  readonly context?: Expr;
  /** Rank exactly these, reached or not. Absent means everything the spread reached. */
  readonly among?: readonly string[];
}

export interface Activated {
  readonly identity: string;
  readonly activation: number;
  readonly base: number;
  readonly spread: number;
  readonly dormant: boolean;
  /** The strongest path that reached it, source first. Just itself when nothing did. */
  readonly path: readonly string[];
  /** What each hop of `path` went through: a relation, `~Relation` backwards, or co-usage. */
  readonly via: readonly string[];
}

/** The latest assertion of each parameter wins, so an edit shadows the seeded default. */
export function activationParameters(store: ConceptStore): ActivationParameters {
  const out: ActivationParameters = { ...ACTIVATION_DEFAULTS };
  const latest = new Map<string, number>();
  for (const r of store.get("Activation")?.relations ?? []) {
    if (!isCall(r.claim) || !(r.claim.head in out)) continue;
    const value = r.claim.args[0]?.value;
    const seq = Math.max(0, ...(r.stamps ?? []).map((s) => s.seq));
    if (typeof value !== "number" || seq < (latest.get(r.claim.head) ?? -1)) continue;
    latest.set(r.claim.head, seq);
    out[r.claim.head as keyof ActivationParameters] = value;
  }
  return out;
}

interface GraphCache {
  readonly version: number;
  readonly uses: Map<string, number[]>;
  readonly edges: Map<string, Map<string, string>>;
}

interface TraceCache {
  readonly length: number;
  readonly reads: Map<string, number[]>;
  readonly coUsed: Map<string, Map<string, number>>;
}

const graphCaches = new WeakMap<ConceptStore, GraphCache>();
const traceCaches = new WeakMap<readonly StoredTraceEvent[], TraceCache>();

function graphCache(store: ConceptStore): GraphCache {
  const held = graphCaches.get(store);
  if (held && held.version === store.version) return held;
  const fresh = { version: store.version, uses: new Map(), edges: new Map() };
  graphCaches.set(store, fresh);
  return fresh;
}

const NO_EVENTS: readonly StoredTraceEvent[] = [];

/** Reads per Concept, and which Concepts ran together in a turn whose root succeeded. */
function traceCache(events: readonly StoredTraceEvent[]): TraceCache {
  const held = traceCaches.get(events);
  if (held && held.length === events.length) return held;
  const reads = new Map<string, number[]>();
  const turns = new Map<number, { ok: boolean; concepts: Set<string> }>();
  for (const e of events) {
    let at = reads.get(e.concept);
    if (!at) reads.set(e.concept, (at = []));
    at.push(Date.parse(e.startedAt));
    if (e.saidSeq === null) continue;
    let turn = turns.get(e.saidSeq);
    if (!turn) turns.set(e.saidSeq, (turn = { ok: false, concepts: new Set() }));
    turn.concepts.add(e.concept);
    if (e.parentEventId === null && e.outcome === "success") turn.ok = true;
  }
  const coUsed = new Map<string, Map<string, number>>();
  for (const { ok, concepts } of turns.values()) {
    if (!ok) continue;
    for (const a of concepts) {
      let row = coUsed.get(a);
      if (!row) coUsed.set(a, (row = new Map()));
      for (const b of concepts) if (a !== b) row.set(b, (row.get(b) ?? 0) + 1);
    }
  }
  const fresh = { length: events.length, reads, coUsed };
  traceCaches.set(events, fresh);
  return fresh;
}

/** When `identity` was used, by its stamps: on what it holds, and on what mentions it. */
function stampUses(store: ConceptStore, cache: GraphCache, identity: string): number[] {
  const held = cache.uses.get(identity);
  if (held) return held;
  const bySeq = new Map<number, number>();
  const note = (r: Relation) => {
    for (const s of r.stamps ?? []) bySeq.set(s.seq, Date.parse(s.recordedAt));
  };
  for (const r of store.get(identity)?.relations ?? []) note(r);
  for (const m of store.mentioning(c(identity))) note(m.relation);
  const uses = [...bySeq.values()];
  cache.uses.set(identity, uses);
  return uses;
}

/**
 * Where `identity` spreads to, and through what. Relations it holds reach everything they
 * mention; relations elsewhere that mention it reach their holder; co-usage reaches what ran
 * beside it. A relation with a context is only an edge where that context is active, so
 * `Moment` reaches music only in a music context (Part 3.3).
 */
function edges(
  store: ConceptStore,
  cache: GraphCache,
  trace: TraceCache,
  identity: string,
  context: Expr | undefined,
): Map<string, string> {
  const key = context === undefined ? identity : `${identity}\u0000${JSON.stringify(context)}`;
  const co = [...(trace.coUsed.get(identity) ?? [])].filter(([to]) => store.has(to)).sort(([a], [b]) => a.localeCompare(b));
  let out = cache.edges.get(key);
  // Co-usage comes from the trace, which the graph's cache does not follow.
  if (out) return co.length ? withCoUsage(new Map(out), co) : out;
  out = new Map<string, string>();
  const add = (to: string, via: string) => {
    if (to !== identity && !out!.has(to) && store.has(to)) out!.set(to, via);
  };
  const holds = (r: Relation) => matchContext(r.context, context, new Map()).ok;
  const head = (r: Relation) => (isCall(r.claim) ? r.claim.head : String(r.claim));
  for (const r of store.get(identity)?.relations ?? []) {
    if (!holds(r)) continue;
    // The relation's own head is the edge, not a neighbour: `IsA` is not related to a
    // Concept by being how the Concept is related to something.
    for (const part of [r.claim, ...(r.context === undefined ? [] : [r.context])]) {
      for (const sub of walk(part)) {
        const to = sub === r.claim ? undefined : mentionKey(sub);
        if (to !== undefined) add(to, head(r));
      }
    }
  }
  for (const m of store.mentioning(c(identity))) if (holds(m.relation)) add(m.identity, `~${head(m.relation)}`);
  cache.edges.set(key, out);
  return co.length ? withCoUsage(new Map(out), co) : out;
}

function withCoUsage(out: Map<string, string>, co: readonly [string, number][]): Map<string, string> {
  for (const [to, n] of co) if (!out.has(to)) out.set(to, `co-used ${n}x`);
  return out;
}

/**
 * Rank by activation. With `among`, exactly those Concepts; otherwise everything spreading
 * from `sources` reached, sources excluded. Deterministic: ties break by the most recent
 * use, then by identity.
 */
export function activation(
  store: ConceptStore,
  sources: readonly string[],
  options: ActivationOptions = {},
): Activated[] {
  const p = activationParameters(store);
  const now = options.now ?? Date.now();
  const cache = graphCache(store);
  const trace = traceCache(options.events ?? NO_EVENTS);

  const spread = spreadFrom(store, cache, trace, sources, options.context, p);
  const latest = new Map<string, number>();
  const base = (identity: string): number => {
    const uses = [...stampUses(store, cache, identity), ...(trace.reads.get(identity) ?? [])];
    latest.set(identity, uses.reduce((m, at) => Math.max(m, at), -Infinity));
    // Seconds, floored at one: uses within the same second count by frequency alone.
    const sum = uses.reduce((acc, at) => acc + Math.max((now - at) / 1000, 1) ** -p.Decay, 0);
    return sum > 0 ? Math.log(sum) : -Infinity;
  };

  const ids = options.among ?? [...spread.keys()];
  const ranked = ids.map((identity): Activated => {
    const b = base(identity);
    const s = spread.get(identity);
    const a = b + (s?.amount ?? 0);
    return {
      identity,
      activation: a,
      base: b,
      spread: s?.amount ?? 0,
      dormant: !(a >= p.DormantBelow),
      path: s?.path ?? [identity],
      via: s?.via ?? [],
    };
  });
  const order = (x: number, y: number) => (x === y ? 0 : x > y ? -1 : 1);
  return ranked.sort(
    (x, y) =>
      order(x.activation, y.activation) ||
      order(latest.get(x.identity)!, latest.get(y.identity)!) ||
      x.identity.localeCompare(y.identity),
  );
}

interface Reached {
  amount: number;
  path: string[];
  via: string[];
}

/**
 * The spreading term. Each source starts with W_j = 1/n. Crossing out of `x` keeps the
 * fraction `(S - ln fan_x) / S` of what reached it, so one hop from a source passes exactly
 * W_j * S_ji, and every further hop passes less. Best first, within `Budget` expansions per
 * call, shared evenly by the sources. A Concept reached from several sources sums them, and
 * keeps the strongest path.
 */
function spreadFrom(
  store: ConceptStore,
  cache: GraphCache,
  trace: TraceCache,
  sources: readonly string[],
  context: Expr | undefined,
  p: ActivationParameters,
): Map<string, Reached> {
  const from = [...new Set(sources)].filter((s) => store.has(s)).sort();
  const total = new Map<string, Reached>();
  if (!from.length || p.Strength <= 0) return total;
  const budget = Math.ceil(p.Budget / from.length);
  for (const source of from) {
    const best = new Map<string, Reached>([[source, { amount: p.Strength / from.length, path: [source], via: [] }]]);
    const frontier = [source];
    const done = new Set<string>();
    for (let spent = 0; frontier.length && spent < budget; spent++) {
      frontier.sort((a, b) => best.get(b)!.amount - best.get(a)!.amount || a.localeCompare(b));
      const x = frontier.shift()!;
      done.add(x);
      const next = edges(store, cache, trace, x, context);
      const keep = Math.max(0, 1 - Math.log(next.size) / p.Strength);
      if (keep === 0) continue;
      const here = best.get(x)!;
      for (const [to, via] of next) {
        if (done.has(to)) continue;
        const amount = here.amount * keep;
        const known = best.get(to);
        if (known && known.amount >= amount) continue;
        if (!known) frontier.push(to);
        best.set(to, { amount, path: [...here.path, to], via: [...here.via, via] });
      }
    }
    for (const [identity, r] of best) {
      if (from.includes(identity)) continue;
      const sum = total.get(identity);
      if (!sum) total.set(identity, { ...r });
      else total.set(identity, { ...(r.amount > sum.amount ? r : sum), amount: sum.amount + r.amount });
    }
  }
  return total;
}
