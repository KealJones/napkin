/**
 * A List Concept that changes by making a new List, in O(log n), sharing what did not change.
 *
 * It is an ordinary `List(...)` to everything that reads expressions: `head` is "List" and
 * `args` are its entries, written out the first time something asks for them and kept. What
 * knows it is a PersistentList reads an entry (`at`) without writing the rest out, and makes
 * the List with some entries changed (`with`) by copying only the path to each: a 32-way trie,
 * as Clojure's vectors are. The List it came from is unchanged; Concepts stay immutable.
 */
import type { Argument, Call, Expr } from "./expression.js";

const BITS = 5;
const WIDTH = 1 << BITS;
const MASK = WIDTH - 1;

type Node = unknown[];

export class PersistentList implements Call {
  readonly head = "List";
  private written?: readonly Argument[];

  private constructor(
    readonly size: number,
    private readonly shift: number,
    private readonly root: Node,
  ) {}

  static of(values: readonly Expr[]): PersistentList {
    let level: Node[] = [];
    for (let i = 0; i < values.length; i += WIDTH) level.push(values.slice(i, i + WIDTH));
    if (!level.length) level.push([]);
    let shift = 0;
    while (level.length > 1) {
      const up: Node[] = [];
      for (let i = 0; i < level.length; i += WIDTH) up.push(level.slice(i, i + WIDTH));
      level = up;
      shift += BITS;
    }
    return new PersistentList(values.length, shift, level[0]);
  }

  /** Its entries as arguments, for whatever reads it as any other Call. */
  get args(): readonly Argument[] {
    return (this.written ??= this.toArray().map((value) => ({ value })));
  }

  at(i: number): Expr | undefined {
    if (!(i >= 0 && i < this.size)) return undefined;
    let node = this.root;
    for (let s = this.shift; s > 0; s -= BITS) node = node[(i >> s) & MASK] as Node;
    return node[i & MASK] as Expr;
  }

  /** This List with these entries changed; each node on a changed path is copied once. */
  with(changes: Iterable<readonly [number, Expr]>): PersistentList {
    const copied = new Set<Node>();
    const own = (n: Node): Node => {
      if (copied.has(n)) return n;
      const c = n.slice();
      copied.add(c);
      return c;
    };
    let root: Node | undefined;
    for (const [i, value] of changes) {
      if (!(Number.isInteger(i) && i >= 0 && i < this.size)) throw new RangeError(`List has no entry ${i}`);
      root ??= own(this.root);
      let node = root;
      for (let s = this.shift; s > 0; s -= BITS) {
        const j = (i >> s) & MASK;
        const child = own(node[j] as Node);
        node[j] = child;
        node = child;
      }
      node[i & MASK] = value;
    }
    return root ? new PersistentList(this.size, this.shift, root) : this;
  }

  toArray(): Expr[] {
    const out: Expr[] = [];
    const walk = (n: Node, s: number): void => {
      if (s === 0) for (const x of n) out.push(x as Expr);
      else for (const x of n) walk(x as Node, s - BITS);
    };
    walk(this.root, this.shift);
    return out;
  }

  toJSON(): Call {
    return { head: this.head, args: this.args };
  }
}

/** Any List's entry, without writing a PersistentList's out. */
export const listAt = (list: Call, i: number): Expr | undefined =>
  list instanceof PersistentList ? list.at(i) : i >= 0 && i < list.args.length ? list.args[i].value : undefined;

export const listSize = (list: Call): number => (list instanceof PersistentList ? list.size : list.args.length);

export const listValues = (list: Call): Expr[] => (list instanceof PersistentList ? list.toArray() : list.args.map((a) => a.value));

/** Any List with these entries changed, as a PersistentList. */
export const listWith = (list: Call, changes: Iterable<readonly [number, Expr]>): PersistentList =>
  (list instanceof PersistentList ? list : PersistentList.of(listValues(list))).with(changes);
