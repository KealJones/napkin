/**
 * The Concept graph, plus the relation index.
 *
 * A relation written inside a unit has an implicit subject: the unit holding it
 * (concept-spec Part 5.1.1). So `IsMarriedTo(Emmy())` in Keal's unit is the triple
 * Keal / IsMarriedTo / Emmy, and the index makes it findable from either end. That is
 * what lets a symmetric relation be derived for Emmy without being stored twice.
 */
import { type Expr, isCall, format, equal, walk } from "../concept/expression.js";
import type { ConceptUnit, Realization, Relation, Stamp } from "../concept/unit.js";

/** Same claim AND same context. Differing on either makes it a separate assertion. */
export const sameRelation = (a: Relation, b: Relation): boolean =>
  equal(a.claim, b.claim) &&
  (a.context === undefined
    ? b.context === undefined
    : b.context !== undefined && equal(a.context, b.context));

export interface Triple {
  readonly subject: string;
  readonly predicate: string;
  readonly object: Expr | undefined;
  readonly expr: Expr;
  /** Where the claim holds. Absent means anywhere. */
  readonly context?: Expr;
}

/** A stable key for the object side of a triple. */
export function objectKey(e: Expr | undefined): string | undefined {
  if (e === undefined) return undefined;
  if (isCall(e)) return e.args.length === 0 ? e.head : format(e);
  return format(e);
}

/** A relation found through the mention index, with the unit that holds it. */
export interface Mention {
  readonly identity: string;
  readonly relation: Relation;
}

/** A stamp found through the time index, with the unit and relation it belongs to. */
export interface StampEntry {
  readonly identity: string;
  readonly relation: Relation;
  readonly stamp: Stamp;
}

/**
 * The key a sub-expression is found under in the mention index (memory-spec Part 9.1): a
 * Concept head regardless of arity, so `GrannySmith` is findable whether it appears as
 * `GrannySmith()` or with arguments, or a literal string or number, formatted the same way
 * `objectKey` formats one. Booleans, `null` and variables are not mentions; a relation is a
 * ground fact and a bare `true` or `false` names nothing to look up.
 */
export function mentionKey(e: Expr): string | undefined {
  if (isCall(e)) return e.head;
  if (typeof e === "string" || typeof e === "number") return format(e);
  return undefined;
}

/** Every distinct mention key a relation's claim (and context, if any) contains. */
function mentionsOf(r: Relation): Set<string> {
  const keys = new Set<string>();
  for (const sub of walk(r.claim)) {
    const key = mentionKey(sub);
    if (key !== undefined) keys.add(key);
  }
  if (r.context !== undefined) {
    for (const sub of walk(r.context)) {
      const key = mentionKey(sub);
      if (key !== undefined) keys.add(key);
    }
  }
  return keys;
}

export class ConceptStore {
  private readonly units = new Map<string, ConceptUnit>();
  private readonly bySubject = new Map<string, Triple[]>();
  /**
   * Bucketed by key, then by the contributing unit, so removing one unit's entries from a
   * key that many units share — `IsA(Bird())`, say — is a single inner `Map.delete`, not a
   * scan or filter of everything under that key. Reading a bucket (`asObject`, `mentioning`)
   * flattens it, which costs what a single flat array always cost; only the write side
   * changes. Without this, a key shared by many units makes every write to any one of them
   * cost as much as the whole bucket, and re-asserting on the same unit over and over is
   * quadratic in the size of the graph, not linear in that unit's own relations.
   */
  private readonly byObject = new Map<string, Map<string, Triple[]>>();
  /** Every relation mentioning a Concept head or literal, at any depth (memory-spec Part 9.1). */
  private readonly byMention = new Map<string, Map<string, Mention[]>>();
  /** Every stamp, by `seq`, for O(1) lookup — the time index (memory-spec Part 9.1). */
  private readonly byStamp = new Map<number, StampEntry>();
  /**
   * Which keys each unit last contributed to `byObject` and `byMention`, so `unindex` visits
   * only the buckets a unit is actually in instead of every key in the map.
   */
  private readonly objectKeysOf = new Map<string, ReadonlySet<string>>();
  private readonly mentionKeysOf = new Map<string, ReadonlySet<string>>();
  /** When each realization was last chosen. Forgetting needs this, and nothing else does. */
  private readonly lastSelected = new Map<string, number>();
  /** The next stamp's `seq`. Store-wide and never reused (memory-spec Part 4.2). */
  private nextSeq = 1;
  /** The next counter to try for a base, so `mint` need not rescan the graph every time. */
  private readonly mintCounters = new Map<string, number>();
  /** Bumped on every write, so a cache derived from the graph knows it is stale in O(1). */
  private writes = 0;

  /** Changes whenever the graph does (activation's cache, memory-spec Part 10.1). */
  get version(): number {
    return this.writes;
  }

  /** The `seq` the next stamp will get, so a snapshot can resume the count. */
  get sequence(): number {
    return this.nextSeq;
  }

  /** Never count backwards past a saved sequence, even if its last stamps are gone. */
  resume(sequence: number): void {
    if (sequence > this.nextSeq) this.nextSeq = sequence;
  }

  /**
   * A stamp taken now and attached later. A message is heard before it is read, and what
   * reading it causes has to point at it, so its `seq` is fixed on arrival and lower than
   * every effect's.
   */
  reserve(source?: number): Stamp {
    return this.stamp(source);
  }

  private stamp(source?: number): Stamp {
    const seq = this.nextSeq++;
    const recordedAt = new Date().toISOString();
    return source === undefined ? { seq, recordedAt } : { seq, recordedAt, source };
  }

  /**
   * A relation keeps the stamps it arrived with, so a loaded graph keeps its history, and
   * the count moves past them so no `seq` is handed out twice. One that has none is being
   * recorded now.
   */
  private withStamps(r: Relation): Relation {
    if (!r.stamps?.length) return { ...r, stamps: [this.stamp()] };
    for (const s of r.stamps) if (s.seq >= this.nextSeq) this.nextSeq = s.seq + 1;
    return r;
  }

  /**
   * A fresh identity, never colliding with anything the graph already holds
   * (memory-spec Part 3.2, Part 13). `<base>_<n>`, readable and meaningless: nothing may
   * parse it, so `n` only has to be free, not consecutive.
   *
   * The counter is not kept as separate persisted state. Every identity `mint` has ever
   * handed out is already a unit in this graph, so the highest existing `<base>_<n>` IS the
   * count a persisted counter would hold, and it can never drift out of step with what got
   * saved. A restart recomputes it once, lazily, by scanning whatever loaded; after that the
   * in-memory counter carries it, the same way `nextSeq` does for stamps.
   */
  mint(base: string): string {
    let n = this.mintCounters.get(base);
    if (n === undefined) {
      n = 0;
      const prefix = `${base}_`;
      for (const identity of this.units.keys()) {
        if (!identity.startsWith(prefix)) continue;
        const rest = identity.slice(prefix.length);
        if (/^\d+$/.test(rest)) n = Math.max(n, Number(rest));
      }
    }
    let identity: string;
    do {
      n += 1;
      identity = `${base}_${n}`;
    } while (this.units.has(identity));
    this.mintCounters.set(base, n);
    this.put({ identity, relations: [], realizations: [] });
    return identity;
  }

  get(identity: string): ConceptUnit | undefined {
    return this.units.get(identity);
  }

  has(identity: string): boolean {
    return this.units.has(identity);
  }

  all(): ConceptUnit[] {
    return [...this.units.values()];
  }

  size(): number {
    return this.units.size;
  }

  /**
   * Seeding is idempotent and additive (seed-concepts Part 1.2): create when absent,
   * otherwise add only what is not already present, comparing structurally. Never
   * remove, never overwrite, never reorder.
   */
  seed(unit: ConceptUnit): { created: boolean; addedRelations: number; addedRealizations: number } {
    const existing = this.units.get(unit.identity);
    if (!existing) {
      this.put({ ...unit, relations: unit.relations.map((r) => this.withStamps(r)) });
      return { created: true, addedRelations: unit.relations.length, addedRealizations: unit.realizations.length };
    }
    // Seeding again is not asserting again, so a relation already held gains no stamp.
    const relations = [...existing.relations];
    let addedRelations = 0;
    for (const r of unit.relations) {
      if (!relations.some((x) => sameRelation(x, r))) {
        relations.push(this.withStamps(r));
        addedRelations += 1;
      }
    }
    const realizations = [...existing.realizations];
    let addedRealizations = 0;
    for (const r of unit.realizations) {
      if (!realizations.some((x) => sameRealization(x, r))) {
        realizations.push(r);
        addedRealizations += 1;
      }
    }
    this.put({ ...existing, relations, realizations });
    return { created: false, addedRelations, addedRealizations };
  }

  /**
   * Realizations and relations are append-only (concept-spec Part 3.1). A realization
   * with the same pattern and context as an existing one shadows it: the newer is
   * selected, the older is retained and simply not chosen.
   */
  addRealization(identity: string, r: Realization): void {
    const existing = this.units.get(identity) ?? { identity, relations: [], realizations: [] };
    this.put({ ...existing, realizations: [...existing.realizations, { ...r, addedAt: new Date().toISOString() }] });
  }

  /**
   * The same claim in a different context is a different relation, not a duplicate. That
   * is the entire point: `IsA(Instant())` under `Time()` and `IsA(MusicSingle())` under
   * `Music()` must coexist, and so must one claim asserted both generally and contextually.
   *
   * Asserting a claim already held adds a stamp to it rather than a second copy
   * (memory-spec Part 4.3): for a lasting fact that is reinforcement, for a happening that
   * recurs it is one more occurrence. `source` is the `seq` of the stamp that caused this
   * assertion, or a stamp already reserved for it. Returns the stamp, so the caller can
   * source what it causes next.
   */
  addRelation(identity: string, claim: Expr | Relation, context?: Expr, cause?: number | Stamp): Stamp {
    const added: Relation =
      typeof claim === "object" && claim !== null && "claim" in claim
        ? claim
        : context === undefined
          ? { claim }
          : { claim, context };
    const existing = this.units.get(identity) ?? { identity, relations: [], realizations: [] };
    const stamp = typeof cause === "object" ? cause : this.stamp(cause);
    const at = existing.relations.findIndex((x) => sameRelation(x, added));
    const relations =
      at < 0
        ? [...existing.relations, { ...added, stamps: [stamp] }]
        : existing.relations.map((r, i) => (i === at ? { ...r, stamps: [...(r.stamps ?? []), stamp] } : r));
    this.put({ ...existing, relations });
    return stamp;
  }

  private put(unit: ConceptUnit): void {
    const previous = this.units.get(unit.identity);
    if (previous) this.unindex(previous);
    this.writes += 1;
    this.units.set(unit.identity, { ...unit, updatedAt: new Date().toISOString() });
    this.index(unit);
  }

  private index(unit: ConceptUnit): void {
    const objectKeys = new Set<string>();
    const mentionKeys = new Set<string>();
    for (const r of unit.relations) {
      const expr = r.claim;
      if (isCall(expr)) {
        const triple: Triple = {
          subject: unit.identity,
          predicate: expr.head,
          object: expr.args[0]?.value,
          expr,
          ...(r.context === undefined ? {} : { context: r.context }),
        };
        push(this.bySubject, unit.identity, triple);
        const key = objectKey(triple.object);
        if (key !== undefined) {
          pushBucketed(this.byObject, key, unit.identity, triple);
          objectKeys.add(key);
        }
      }
      const mention: Mention = { identity: unit.identity, relation: r };
      for (const key of mentionsOf(r)) {
        pushBucketed(this.byMention, key, unit.identity, mention);
        mentionKeys.add(key);
      }
      for (const stamp of r.stamps ?? []) this.byStamp.set(stamp.seq, { identity: unit.identity, relation: r, stamp });
    }
    this.objectKeysOf.set(unit.identity, objectKeys);
    this.mentionKeysOf.set(unit.identity, mentionKeys);
  }

  private unindex(unit: ConceptUnit): void {
    this.bySubject.delete(unit.identity);
    for (const key of this.objectKeysOf.get(unit.identity) ?? []) unbucket(this.byObject, key, unit.identity);
    this.objectKeysOf.delete(unit.identity);
    for (const key of this.mentionKeysOf.get(unit.identity) ?? []) unbucket(this.byMention, key, unit.identity);
    this.mentionKeysOf.delete(unit.identity);
    for (const r of unit.relations) for (const stamp of r.stamps ?? []) this.byStamp.delete(stamp.seq);
  }

  /**
   * The relation a stamp belongs to. A relation cannot be named but its stamps can, so
   * this is how a `source` is followed back (memory-spec Part 4.4). O(1) through the time
   * index (Part 9.1), no longer a scan of every unit.
   */
  findStamp(seq: number): StampEntry | undefined {
    return this.byStamp.get(seq);
  }

  /**
   * Remove these stamps, and any relation left with none (memory-spec Part 10.3). The only
   * way a record leaves the graph apart from `forgetConcept`, and used only when something
   * asked for it to go: explicit forgetting (Part 10.5). Returns how many relations went.
   */
  collect(seqs: ReadonlySet<number>): number {
    const touched = new Set<string>();
    for (const seq of seqs) {
      const entry = this.byStamp.get(seq);
      if (entry) touched.add(entry.identity);
    }
    let removed = 0;
    for (const identity of touched) {
      const unit = this.units.get(identity)!;
      const relations = unit.relations
        .map((r) => ({ ...r, stamps: (r.stamps ?? []).filter((st) => !seqs.has(st.seq)) }))
        .filter((r) => {
          const keep = r.stamps.length > 0;
          if (!keep) removed += 1;
          return keep;
        });
      this.put({ ...unit, relations });
    }
    return removed;
  }

  /** Every (unit, relation, stamp) with `recordedAt` in `[from, to]` — the time index. */
  between(from: string, to: string): StampEntry[] {
    const out: StampEntry[] = [];
    for (const entry of this.byStamp.values()) {
      if (entry.stamp.recordedAt >= from && entry.stamp.recordedAt <= to) out.push(entry);
    }
    return out.sort((a, b) => a.stamp.seq - b.stamp.seq);
  }

  /**
   * Every relation mentioning `value` anywhere in its claim or context, at any depth — the
   * mention index (memory-spec Part 9.1). `value` is keyed the same way as a mention inside
   * a claim (`mentionKey`): a Concept head, e.g. `GrannySmith()`, or a literal string or
   * number.
   */
  mentioning(value: Expr): Mention[] {
    const key = mentionKey(value);
    return key === undefined ? [] : flatten(this.byMention.get(key));
  }

  /** Record that a realization was chosen, for the forgetting pass. */
  recordSelection(identity: string, index: number, at = Date.now()): void {
    this.lastSelected.set(`${identity}#${index}`, at);
  }

  selectedAt(identity: string, index: number): number | undefined {
    return this.lastSelected.get(`${identity}#${index}`);
  }

  /** Replace a unit's realizations wholesale. Used only by the forgetting pass. */
  replaceRealizations(identity: string, realizations: readonly Realization[]): void {
    const existing = this.units.get(identity);
    if (!existing) return;
    this.put({ ...existing, realizations });
    this.lastSelected.clear();
  }

  /**
   * Remove a Concept outright. Used only for an isolated conversation, whose transcript
   * is deliberately not kept — knowledge is never removed this way.
   */
  /**
   * Whether a relation no longer holds: every stamp it has is the target of a
   * `Retracts(seq)` on the same unit (concept-spec Part 3.1, memory-spec Part 4.5). Both
   * the assertion and the retraction keep their stamps, so when it held stays answerable,
   * and asserting it again adds a stamp nothing has retracted.
   */
  retracted(identity: string, claim: Expr): boolean {
    const unit = this.units.get(identity);
    if (!unit) return false;
    const relation = unit.relations.find((r) => r.claim === claim) ?? unit.relations.find((r) => equal(r.claim, claim));
    if (!relation?.stamps?.length) return false;
    const gone = new Set<number>();
    for (const r of unit.relations) {
      if (isCall(r.claim) && r.claim.head === "Retracts" && typeof r.claim.args[0]?.value === "number") gone.add(r.claim.args[0].value);
    }
    return gone.size > 0 && relation.stamps.every((st) => gone.has(st.seq));
  }

  /**
   * Point every stamp caused by one of `from` at `to` instead. Used when what caused them is
   * about to go but what they record stays: an isolated conversation's words are discarded,
   * the beliefs they caused are kept and attributed to `Isolated()` (memory-spec Part 12).
   */
  resource(from: ReadonlySet<number>, to: number): number {
    const touched = new Set<string>();
    for (const entry of this.byStamp.values()) {
      if (entry.stamp.source !== undefined && from.has(entry.stamp.source)) touched.add(entry.identity);
    }
    let moved = 0;
    for (const identity of touched) {
      const unit = this.units.get(identity)!;
      const relations = unit.relations.map((r) => ({
        ...r,
        stamps: (r.stamps ?? []).map((st) => {
          if (st.source === undefined || !from.has(st.source)) return st;
          moved += 1;
          return { ...st, source: to };
        }),
      }));
      this.put({ ...unit, relations });
    }
    return moved;
  }

  forgetConcept(identity: string): boolean {
    const unit = this.units.get(identity);
    if (!unit) return false;
    this.unindex(unit);
    this.units.delete(identity);
    this.writes += 1;
    return true;
  }

  /** Text search over identities, for lookup rather than bulk inclusion. */
  search(query: string, limit = 50): ConceptUnit[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return this.all().slice(0, limit);
    const scored = this.all()
      .map((u) => {
        const id = u.identity.toLowerCase();
        const score = id === needle ? 3 : id.startsWith(needle) ? 2 : id.includes(needle) ? 1 : 0;
        return { u, score };
      })
      .filter((x) => x.score > 0);
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.u);
  }

  /** Triples with this Concept as subject. */
  asSubject(identity: string): Triple[] {
    return this.bySubject.get(identity) ?? [];
  }

  /** Triples with this Concept as object — the other direction (concept-spec Part 5.2). */
  asObject(identity: string): Triple[] {
    return flatten(this.byObject.get(identity));
  }

  /** Every stored triple. */
  triples(): Triple[] {
    return [...this.bySubject.values()].flat();
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Add to the bucket for `key`, itself sub-bucketed by the identity that contributed it. */
function pushBucketed<T>(map: Map<string, Map<string, T[]>>, key: string, identity: string, value: T): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Map();
    map.set(key, bucket);
  }
  push(bucket, identity, value);
}

/** Drop one identity's contribution to `key`, in O(1) regardless of who else is in it. */
function unbucket<T>(map: Map<string, Map<string, T[]>>, key: string, identity: string): void {
  const bucket = map.get(key);
  if (!bucket) return;
  bucket.delete(identity);
  if (bucket.size === 0) map.delete(key);
}

/** Every entry under a key, across every identity that contributed one. */
function flatten<T>(bucket: Map<string, T[]> | undefined): T[] {
  return bucket ? [...bucket.values()].flat() : [];
}

function sameRealization(a: Realization, b: Realization): boolean {
  const ctx = (r: Realization) => (r.context === undefined ? "" : format(r.context));
  return equal(a.pattern, b.pattern) && ctx(a) === ctx(b) && equal(a.body, b.body);
}
