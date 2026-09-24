/**
 * The one place a Concept value becomes a JavaScript value and back, for this host's own
 * implementation of the code primitives (ir-spec 10.8). A Rust host has its own.
 *
 *   Undefined()                     undefined
 *   List(a, b)                      [a, b], its elements converted too
 *   Record(k=v, ...)                { k: v, ... }, a plain object; Argument(...) too
 *   Instant(ms)                     a Date at that instant
 *   Regex("p", "flags")             a RegExp
 *   MutableSet(ref)                 a Set of what its cell holds
 *   MutableMap(ref)                 a Map of what its cell holds, Pairs
 * Any other Concept is itself: an expression passes through as the object it is.
 */
import { type Call, type Expr, call, isCall } from "../concept/expression.js";
import type { CellStore } from "../store/cells.js";

const isExprObject = (v: unknown): v is Call =>
  typeof v === "object" && v !== null && typeof (v as Call).head === "string" && Array.isArray((v as Call).args);

const U = (): Call => call("Undefined");

export function toHost(v: unknown, cells?: CellStore): unknown {
  if (!isCall(v as Expr)) return v;
  const e = v as Call;
  if (e.head === "Undefined" && !e.args.length) return undefined;
  if (e.head === "List") return e.args.map((a) => toHost(a.value, cells));
  if (e.head === "Record" || e.head === "Argument") return Object.fromEntries(e.args.map((a) => [a.name ?? "", toHost(a.value, cells)]));
  if (e.head === "Instant" && typeof e.args[0]?.value === "number") return new Date(e.args[0].value);
  if (e.head === "Regex" && typeof e.args[0]?.value === "string") return new RegExp(e.args[0].value, String(e.args[1]?.value ?? ""));
  // A Set or a Map is its members, held in a cell because it can change.
  const ref = e.args[0]?.value;
  const held = isCall(ref as Expr) && (ref as Call).head === "CellRef";
  if (e.head === "MutableSet" && cells && held) return new Set(toHost(cells.read(ref as Expr), cells) as unknown[]);
  if (e.head === "MutableMap" && cells && held) return new Map((toHost(cells.read(ref as Expr), cells) as Call[]).map((p) => [toHost(p.args[0]?.value, cells), toHost(p.args[1]?.value, cells)]));
  return e;
}

export function fromHost(v: unknown): Expr {
  if (v === undefined) return U();
  if (v === null || typeof v === "string" || typeof v === "boolean") return v as Expr;
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return call("List", v.map((x) => ({ value: fromHost(x) })));
  if (v instanceof Date) return call("Instant", [{ value: v.getTime() }]);
  if (v instanceof RegExp) return call("Regex", [{ value: v.source }, { value: v.flags }]);
  if (v instanceof Set) return call("List", [...v].map((x) => ({ value: fromHost(x) })));
  if (v instanceof Map) return call("List", [...v].map(([k, x]) => ({ value: call("Pair", [{ value: fromHost(k) }, { value: fromHost(x) }]) })));
  if (isExprObject(v)) return v;
  if (typeof v === "object" && "variable" in (v as object)) return v as Expr;
  if (typeof v === "object") {
    return call("Record", Object.entries(v as object).filter(([, x]) => typeof x !== "function").map(([name, x]) => ({ name, value: fromHost(x) })));
  }
  throw new Error(`No Concept holds a ${typeof v}`);
}
