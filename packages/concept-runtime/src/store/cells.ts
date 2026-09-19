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
  private readonly cells = new Map<string, Expr>();
  private next = 0;

  allocate(initial: Expr): Expr {
    const id = `c${(this.next += 1)}`;
    this.cells.set(id, initial);
    return c(CELL_REF, id);
  }

  read(ref: Expr): Expr {
    const id = refId(ref);
    if (id === undefined || !this.cells.has(id)) {
      throw new Error(`Not a cell reference: ${JSON.stringify(ref)}`);
    }
    return this.cells.get(id)!;
  }

  write(ref: Expr, value: Expr): Expr {
    const id = refId(ref);
    if (id === undefined || !this.cells.has(id)) {
      throw new Error(`Not a cell reference: ${JSON.stringify(ref)}`);
    }
    this.cells.set(id, value);
    return value;
  }

  size(): number {
    return this.cells.size;
  }
}

export function refId(ref: Expr): string | undefined {
  if (!isCall(ref) || ref.head !== CELL_REF) return undefined;
  const id = ref.args[0]?.value;
  return typeof id === "string" ? id : undefined;
}
