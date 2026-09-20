/**
 * Relation inference, driven entirely by properties the relation Concepts declare about
 * themselves (concept-spec Part 5.3). The evaluator knows none of these identities; it
 * reads `Symmetric()`, `InverseOf(...)`, `Transitive()` off the relation's own unit.
 *
 * Implied relations are derived at query time and never materialized, so one truth is
 * stored once and a retraction cannot be applied to only one end.
 */
import { type Expr, c, format, isCall } from "../concept/expression.js";
import { ConceptStore, objectKey, type Triple } from "./store.js";

export type Truth = "true" | "false" | "unknown";

const PROPERTY = {
  symmetric: "Symmetric",
  asymmetric: "Asymmetric",
  transitive: "Transitive",
  irreflexive: "Irreflexive",
  functional: "Functional",
  inverseOf: "InverseOf",
  disjoint: "Disjoint",
} as const;

export class Relations {
  constructor(private readonly store: ConceptStore) {}

  /** Does this relation Concept declare the given property? */
  private declares(predicate: string, property: string): boolean {
    const unit = this.store.get(predicate);
    return unit?.relations.some((r) => isCall(r) && r.head === property) ?? false;
  }

  private inverseOf(predicate: string): string | undefined {
    const unit = this.store.get(predicate);
    for (const r of unit?.relations ?? []) {
      if (isCall(r) && r.head === PROPERTY.inverseOf) {
        const target = r.args[0]?.value;
        if (isCall(target)) return target.head;
      }
    }
    return undefined;
  }

  /**
   * Every relation involving this Concept as subject, direct or derived.
   * This is a query over the index, not a read of the unit.
   */
  of(identity: string, options: { transitive?: boolean } = {}): Triple[] {
    const out: Triple[] = [];
    const seen = new Set<string>();
    const add = (t: Triple) => {
      const key = `${t.subject}|${t.predicate}|${objectKey(t.object) ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t);
    };

    for (const t of this.store.asSubject(identity)) add(t);

    // Found from the other end: symmetry and inverses.
    for (const t of this.store.asObject(identity)) {
      if (this.declares(t.predicate, PROPERTY.symmetric)) {
        add({
          subject: identity,
          predicate: t.predicate,
          object: c(t.subject),
          expr: c(t.predicate, c(t.subject)),
        });
      }
      const inverse = this.inverseOf(t.predicate);
      if (inverse) {
        add({
          subject: identity,
          predicate: inverse,
          object: c(t.subject),
          expr: c(inverse, c(t.subject)),
        });
      }
    }

    if (options.transitive !== false) {
      for (const t of [...out]) {
        if (!this.declares(t.predicate, PROPERTY.transitive)) continue;
        for (const reached of this.closure(t)) add(reached);
      }
    }
    return out;
  }

  /** Transitive closure from one triple, with a visited set so cycles terminate. */
  private closure(start: Triple): Triple[] {
    const out: Triple[] = [];
    const seen = new Set<string>([start.subject]);
    let frontier = [start];
    while (frontier.length) {
      const next: Triple[] = [];
      for (const t of frontier) {
        const key = objectKey(t.object);
        if (key === undefined || seen.has(key)) continue;
        seen.add(key);
        for (const onward of this.store.asSubject(key)) {
          if (onward.predicate !== start.predicate) continue;
          const reached: Triple = {
            subject: start.subject,
            predicate: start.predicate,
            object: onward.object,
            expr: onward.expr,
          };
          out.push(reached);
          next.push(onward);
        }
      }
      frontier = next;
    }
    return out;
  }

  /**
   * Three-valued over an open world (concept-spec Part 5.2). Absence is unknown, never
   * false: a system built to learn cannot treat "not yet taught" as "untrue".
   */
  truth(subject: string, predicate: string, object: Expr): Truth {
    const wanted = objectKey(object);
    const derived = this.of(subject);
    if (derived.some((t) => t.predicate === predicate && objectKey(t.object) === wanted))
      return "true";
    if (this.contradicted(subject, predicate, object)) return "false";
    return "unknown";
  }

  /** What counts as a contradiction is fixed by the predicate's declared properties. */
  private contradicted(subject: string, predicate: string, object: Expr): boolean {
    const wanted = objectKey(object);
    if (wanted === undefined) return false;

    // Explicit negation: Not(Relation(...)) asserted on the subject.
    for (const t of this.store.asSubject(subject)) {
      if (t.predicate !== "Not") continue;
      const inner = t.object;
      if (inner === undefined || !isCall(inner) || inner.head !== predicate) continue;
      const innerObject = inner.args[0]?.value;
      if (innerObject !== undefined && objectKey(innerObject) === wanted) return true;
    }

    // Asymmetric: holding in both directions is a contradiction.
    if (this.declares(predicate, PROPERTY.asymmetric)) {
      const back = this.store.asSubject(wanted).some(
        (t) => t.predicate === predicate && objectKey(t.object) === subject,
      );
      if (back) return true;
    }

    // Irreflexive: it never holds of itself.
    if (this.declares(predicate, PROPERTY.irreflexive) && wanted === subject) return true;

    // Functional: a different object already fills the only slot.
    if (this.declares(predicate, PROPERTY.functional)) {
      const other = this.store
        .asSubject(subject)
        .some((t) => t.predicate === predicate && objectKey(t.object) !== wanted);
      if (other) return true;
    }

    // Disjoint: the subject is already something declared disjoint from the target.
    const disjoint = this.disjointWith(wanted);
    if (disjoint.size) {
      const held = this.of(subject).some(
        (t) => t.predicate === predicate && disjoint.has(objectKey(t.object) ?? ""),
      );
      if (held) return true;
    }
    return false;
  }

  private disjointWith(identity: string): Set<string> {
    const out = new Set<string>();
    const unit = this.store.get(identity);
    for (const r of unit?.relations ?? []) {
      if (isCall(r) && r.head === PROPERTY.disjoint) {
        const key = objectKey(r.args[0]?.value);
        if (key) out.add(key);
      }
    }
    for (const t of this.store.asObject(identity)) {
      if (t.predicate === PROPERTY.disjoint) out.add(t.subject);
    }
    return out;
  }

  /**
   * The equivalence cluster around a Concept: everything reachable by relations declared
   * Symmetric and Transitive, plus IsA parents (concept-spec Part 11.1). Search returns
   * this rather than the single node, which is also how an orphan is detected.
   */
  cluster(identity: string, limit = 24, equivalenceOnly = false): { identity: string; via: string }[] {
    const out = new Map<string, string>();
    const queue: string[] = [identity];
    const seen = new Set<string>([identity]);
    while (queue.length && out.size < limit) {
      const current = queue.shift()!;
      for (const t of [...this.store.asSubject(current), ...this.store.asObject(current)]) {
        // Symmetric alone makes something a neighbour. Only symmetric AND transitive makes
        // it a neighbour's neighbour: a relation that does not close must not be walked as
        // though it did, or every synonym chain collapses into one blob.
        const isSymmetric = this.declares(t.predicate, PROPERTY.symmetric);
        const closes = isSymmetric && this.declares(t.predicate, PROPERTY.transitive);
        const isParent = !equivalenceOnly && t.predicate === "IsA";
        if (!isSymmetric && !isParent) continue;
        const other = t.subject === current ? objectKey(t.object) : t.subject;
        if (!other || seen.has(other)) continue;
        seen.add(other);
        out.set(other, t.predicate);
        if (closes) queue.push(other);
      }
    }
    return [...out].map(([id, via]) => ({ identity: id, via }));
  }
}
