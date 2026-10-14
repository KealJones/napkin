/**
 * Learning what goes with what, from examples: the general part of learning a word's meaning from
 * the company it keeps and what follows it. Nothing here knows about words, numbers or situations;
 * callers say what the context of an example is (its words, pairs of words, where they stand) and
 * what came out of it (a number its working used, which way a step went), and these say what can be
 * relied on.
 *
 * - `Associations`: which context goes with which outcome far more often than the outcome comes at
 *   all (lift), so a common outcome ("2", in workings) does not look tied to every word.
 * - `Directions`: which way a thing points, from evidence for each way: against how often anything
 *   points that way when one way is the default (most workings add), or by a clear majority.
 */

export interface Association<C extends string = string, O extends string | number = string | number> {
  readonly context: C;
  readonly outcome: O;
  /** Examples with both. */
  readonly count: number;
  /** Examples with the context. */
  readonly of: number;
  /** Of the examples with the context, the share with the outcome. */
  readonly share: number;
  /** How much more often than the outcome comes at all. */
  readonly lift: number;
}

export class Associations<C extends string = string, O extends string | number = string | number> {
  private readonly contexts = new Map<C, number>();
  private readonly outcomes = new Map<O, number>();
  private readonly both = new Map<C, Map<O, number>>();
  private examples = 0;

  /** One example: what was in it, and what came out of it. */
  observe(context: Iterable<C>, outcomes: Iterable<O>): void {
    this.examples++;
    const os = new Set(outcomes);
    for (const o of os) this.outcomes.set(o, (this.outcomes.get(o) ?? 0) + 1);
    for (const c of new Set(context)) {
      this.contexts.set(c, (this.contexts.get(c) ?? 0) + 1);
      if (!os.size) continue;
      const m = this.both.get(c) ?? new Map<O, number>();
      for (const o of os) m.set(o, (m.get(o) ?? 0) + 1);
      this.both.set(c, m);
    }
  }

  /** What can be relied on: seen together often enough, in enough of the context's examples, well above chance. */
  kept({ least = 8, share = 0.2, lift = 3 } = {}): Association<C, O>[] {
    const out: Association<C, O>[] = [];
    for (const [c, m] of this.both) {
      const of = this.contexts.get(c)!;
      for (const [o, count] of m) {
        const s = count / of;
        const l = s / ((this.outcomes.get(o) ?? 1) / this.examples);
        if (count >= least && s >= share && l >= lift) out.push({ context: c, outcome: o, count, of, share: s, lift: l });
      }
    }
    return out.sort((a, b) => b.lift - a.lift);
  }

  /** The best-tied outcome of each context. */
  best(options?: { least?: number; share?: number; lift?: number }): Map<C, Association<C, O>> {
    const out = new Map<C, Association<C, O>>();
    for (const a of this.kept(options)) if (!out.has(a.context)) out.set(a.context, a);
    return out;
  }

  /** How many examples had the context. */
  seen(context: C): number {
    return this.contexts.get(context) ?? 0;
  }
}

export type Way = "Up" | "Down";

export interface Direction<K extends string = string> {
  readonly key: K;
  readonly way: Way;
  readonly for: number;
  readonly against: number;
  /** How far from what was expected, in standard errors (by base rate), or the ratio (by majority). */
  readonly strength: number;
}

/**
 * Evidence for which way each thing points, kept per kind of thing (a group: what doings do, what
 * comparing words do), as each kind has its own base rate.
 */
export class Directions<K extends string = string> {
  private readonly tally = new Map<K, { group: string; Up: number; Down: number }>();

  add(key: K, group: string, way: Way, weight = 1): void {
    const t = this.tally.get(key) ?? { group, Up: 0, Down: 0 };
    t[way] += weight;
    this.tally.set(key, t);
  }

  /** How often things of a group point down at all. */
  base(group: string): number {
    let up = 0, down = 0;
    for (const t of this.tally.values()) if (t.group === group) (up += t.Up), (down += t.Down);
    return up + down ? down / (up + down) : 0.5;
  }

  /**
   * What is decided. "base": a way is decided when the thing points down clearly more often (z
   * standard errors) than its group does, or clearly less: for groups with a default way. "majority":
   * when one way has `ratio` times the other: for groups with no default.
   */
  decided(group: string, how: { by: "base"; z?: number; least?: number } | { by: "majority"; ratio?: number; least?: number }): Direction<K>[] {
    const out: Direction<K>[] = [];
    const p0 = this.base(group);
    for (const [key, t] of this.tally) {
      if (t.group !== group) continue;
      const n = t.Up + t.Down;
      if (n < (how.least ?? 3)) continue;
      if (how.by === "base") {
        const z = (t.Down / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
        if (Math.abs(z) < (how.z ?? 3)) continue;
        const way: Way = z > 0 ? "Down" : "Up";
        out.push({ key, way, for: t[way], against: t[way === "Up" ? "Down" : "Up"], strength: Math.abs(z) });
      } else {
        const [hi, lo, way] = t.Up >= t.Down ? [t.Up, t.Down, "Up" as Way] : [t.Down, t.Up, "Down" as Way];
        if (hi < (how.ratio ?? 3) * lo) continue;
        out.push({ key, way, for: hi, against: lo, strength: lo ? hi / lo : hi });
      }
    }
    return out.sort((a, b) => b.strength - a.strength);
  }
}
