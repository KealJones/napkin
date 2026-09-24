/**
 * The Concept graph, plus the relation index.
 *
 * A relation written inside a unit has an implicit subject: the unit holding it
 * (concept-spec Part 5.1.1). So `IsMarriedTo(Emmy())` in Keal's unit is the triple
 * Keal / IsMarriedTo / Emmy, and the index makes it findable from either end. That is
 * what lets a symmetric relation be derived for Emmy without being stored twice.
 */
import { type Expr, isCall, format, equal } from "../concept/expression.js";
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

export class ConceptStore {
  private readonly units = new Map<string, ConceptUnit>();
  private readonly bySubject = new Map<string, Triple[]>();
  private readonly byObject = new Map<string, Triple[]>();
  /** When each realization was last chosen. Forgetting needs this, and nothing else does. */
  private readonly lastSelected = new Map<string, number>();
  /** The next stamp's `seq`. Store-wide and never reused (memory-spec Part 4.2). */
  private nextSeq = 1;
  /** The next counter to try for a base, so `mint` need not rescan the graph every time. */
  private readonly mintCounters = new Map<string, number>();

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
    this.units.set(unit.identity, { ...unit, updatedAt: new Date().toISOString() });
    this.index(unit);
  }

  private index(unit: ConceptUnit): void {
    for (const r of unit.relations) {
      const expr = r.claim;
      if (!isCall(expr)) continue;
      const triple: Triple = {
        subject: unit.identity,
        predicate: expr.head,
        object: expr.args[0]?.value,
        expr,
        ...(r.context === undefined ? {} : { context: r.context }),
      };
      push(this.bySubject, unit.identity, triple);
      const key = objectKey(triple.object);
      if (key !== undefined) push(this.byObject, key, triple);
    }
  }

  private unindex(unit: ConceptUnit): void {
    this.bySubject.delete(unit.identity);
    for (const [key, triples] of this.byObject) {
      const kept = triples.filter((t) => t.subject !== unit.identity);
      if (kept.length) this.byObject.set(key, kept);
      else this.byObject.delete(key);
    }
  }

  /**
   * The relation a stamp belongs to. A relation cannot be named but its stamps can, so
   * this is how a `source` is followed back (memory-spec Part 4.4). A scan for now; the
   * time index replaces it.
   */
  findStamp(seq: number): { identity: string; relation: Relation; stamp: Stamp } | undefined {
    for (const unit of this.units.values()) {
      for (const relation of unit.relations) {
        const stamp = relation.stamps?.find((s) => s.seq === seq);
        if (stamp) return { identity: unit.identity, relation, stamp };
      }
    }
    return undefined;
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
  forgetConcept(identity: string): boolean {
    const unit = this.units.get(identity);
    if (!unit) return false;
    this.unindex(unit);
    this.units.delete(identity);
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
    return this.byObject.get(identity) ?? [];
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

function sameRealization(a: Realization, b: Realization): boolean {
  const ctx = (r: Realization) => (r.context === undefined ? "" : format(r.context));
  return equal(a.pattern, b.pattern) && ctx(a) === ctx(b) && equal(a.body, b.body);
}
