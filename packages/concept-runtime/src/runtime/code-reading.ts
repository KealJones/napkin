/**
 * Code a message holds, read as Concepts: the TypeScript import (src/code/import.ts), with
 * the comments kept. A comment is where the writer said in words what the code does or is
 * still to do ("// loop over args here"), so it stays in the reading as Comment("...") at
 * its place, for hearing to hear and the graph to reason over.
 */
import { type Expr, call, isCall } from "../concept/expression.js";
import { importTypeScript } from "../code/import.js";

/** A comment written as a statement the import keeps: `// x` is `Comment("x");`. */
const commented = (code: string): string =>
  code
    .replace(/\/\*([\s\S]*?)\*\//g, (_m, text: string) => `Comment(${JSON.stringify(text.trim())});`)
    .replace(/(^|[^:"'`])\/\/([^\n]*)/g, (_m, before: string, text: string) => `${before}Comment(${JSON.stringify(text.trim())});`);

/** Call($Comment, "x") as the import writes it is Comment("x"). */
function comments(e: Expr): Expr {
  if (!isCall(e)) return e;
  const callee = e.args[0]?.value;
  if (e.head === "Call" && callee !== null && typeof callee === "object" && "variable" in callee && callee.variable === "Comment") {
    return call("Comment", e.args.slice(1));
  }
  return call(e.head, e.args.map((a) => ({ ...a, value: comments(a.value) })));
}

/** The code as Concepts, or undefined when it does not read as code. */
export function readCode(code: string): Expr | undefined {
  try {
    const read = importTypeScript(commented(code));
    if (read.unsupported.length) return undefined;
    return comments(read.expression);
  } catch {
    return undefined;
  }
}
