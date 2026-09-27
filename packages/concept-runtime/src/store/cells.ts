/**
 * Mutable state, addressed by opaque id (ir-spec Part 10.5).
 *
 * The reference is an id rather than a pointer, which is what makes this cost nothing:
 * copying a CellRef still names the same entry, so neither matching nor substitution
 * changes. Single assignment of bindings is preserved — a variable always denotes the
 * same cell; the cell's contents change.
 */
import { type Expr, c, isCall } from "../concept/expression.js";

export const CELL_REF = "CellRef";

export class CellStore {
  // A cell is a numbered slot: CellRef(n) is the slot's index, so reading one is an array
  // access, not a string key looked up in a Map.
  private readonly slots: Expr[] = [];

  allocate(initial: Expr): Expr {
    this.slots.push(initial);
    return c(CELL_REF, this.slots.length - 1);
  }

  read(ref: Expr): Expr {
    return this.slots[this.slot(ref)];
  }

  write(ref: Expr, value: Expr): Expr {
    this.slots[this.slot(ref)] = value;
    return value;
  }

  size(): number {
    return this.slots.length;
  }

  private slot(ref: Expr): number {
    const id = refId(ref);
    if (id === undefined || id >= this.slots.length) throw new Error(`Not a cell reference: ${JSON.stringify(ref)}`);
    return id;
  }
}

export function refId(ref: Expr): number | undefined {
  if (!isCall(ref) || ref.head !== CELL_REF) return undefined;
  const id = ref.args[0]?.value;
  return typeof id === "number" && id >= 0 && Number.isInteger(id) ? id : undefined;
}
