/**
 * The Concept graph, plus the relation index.
 *
 * A relation written inside a unit has an implicit subject: the unit holding it
 * (concept-spec Part 5.1.1). So `IsMarriedTo(Emmy())` in Keal's unit is the triple
 * Keal / IsMarriedTo / Emmy, and the index makes it findable from either end. That is
 * what lets a symmetric relation be derived for Emmy without being stored twice.
 */
import { type Expr, isCall, format, equal } from "../concept/expression.js";
import type { ConceptUnit, Realization } from "../concept/unit.js";

export interface Triple {
  readonly subject: string;
  readonly predicate: string;
  readonly object: Expr | undefined;
  readonly expr: Expr;
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
      this.put(unit);
      return { created: true, addedRelations: unit.relations.length, addedRealizations: unit.realizations.length };
    }
    const relations = [...existing.relations];
    let addedRelations = 0;
    for (const r of unit.relations) {
      if (!relations.some((x) => equal(x, r))) {
        relations.push(r);
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

  addRelation(identity: string, relation: Expr): void {
    const existing = this.units.get(identity) ?? { identity, relations: [], realizations: [] };
    if (existing.relations.some((x) => equal(x, relation))) return;
    this.put({ ...existing, relations: [...existing.relations, relation] });
  }

  private put(unit: ConceptUnit): void {
    const previous = this.units.get(unit.identity);
    if (previous) this.unindex(previous);
    this.units.set(unit.identity, { ...unit, updatedAt: new Date().toISOString() });
    this.index(unit);
  }

  private index(unit: ConceptUnit): void {
    for (const expr of unit.relations) {
      if (!isCall(expr)) continue;
      const triple: Triple = {
        subject: unit.identity,
        predicate: expr.head,
        object: expr.args[0]?.value,
        expr,
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
