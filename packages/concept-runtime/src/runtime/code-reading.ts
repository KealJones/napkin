/**
 * Code a message holds, read as Concepts: the TypeScript import (src/code/import.ts), which
 * keeps comments where they were written (Comment("...")), for hearing to hear and the graph
 * to reason over.
 */
import type { Expr } from "../concept/expression.js";
import { importTypeScript } from "../code/import.js";

/** The code as Concepts, or undefined when it does not read as code. */
export function readCode(code: string): Expr | undefined {
  try {
    const read = importTypeScript(code);
    return read.unsupported.length ? undefined : read.expression;
  } catch {
    return undefined;
  }
}
