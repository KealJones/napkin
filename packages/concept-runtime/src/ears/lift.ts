/**
 * The line form, and lifting it to an expression (ir-spec Part 9.2).
 *
 * The producer writes one line per phrase, either a plain expression or `$name = expr`.
 * One line lifts to itself; N lines lift to Sequence(...). The producer therefore never
 * writes Sequence, never writes a root wrapper, and never has to close an outer paren —
 * which was the only hard failure measured on a 4B.
 *
 * Lines also give fault isolation: one malformed line is one malformed clause, and the
 * others still parse.
 */
import { type Expr, c, call, parse, v } from "../concept/expression.js";

export interface Lifted {
  readonly expression: Expr | undefined;
  readonly clauses: number;
  readonly rejected: { line: string; reason: string }[];
}

const ASSIGNMENT = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;

/** Append missing close parens. The measured failure was always short, never long. */
export function balance(text: string): string {
  let open = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "(") open += 1;
    else if (ch === ")") open -= 1;
  }
  if (open > 0) return text + ")".repeat(open);
  if (open < 0) return text.slice(0, open);
  return text;
}

/**
 * Single-quoted strings are not in the grammar, but a small model writes them anyway.
 * Converting is unambiguous when the line contains no double quotes at all.
 */
export function doubleQuotes(text: string): string {
  if (text.includes('"')) return text;
  return text.replace(/'([^']*)'/g, (_, inner: string) => JSON.stringify(inner));
}

/**
 * `?` is not in the grammar at any position, so a bare one can only ever be a model
 * writing a placeholder for an unknown. That is exactly what `$_` means, and the rewrite
 * is unambiguous precisely because `?` is otherwise illegal.
 *
 * Measured live: `What(Multiply(?, ?))` was rejected outright, the clause was dropped, and
 * the turn answered the half of the sentence that survived.
 */
export function placeholders(text: string): string {
  if (!text.includes("?")) return text;
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (!inString && ch === "?") { out += "$_"; continue; }
    out += ch;
  }
  return out;
}

/**
 * Last resort for output that was cut off mid-token by a generation cap. A model that
 * runs away -- a 27B listing SynonymOf for a thousand tokens -- produces a prefix that is
 * perfectly good up to the cut and unparseable after it. Trimming back to the last
 * complete argument keeps what it managed to say.
 *
 * Deliberately last: it discards content, so anything that parses outright must win.
 */
export function salvage(text: string): string {
  let candidate = text;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const cut = candidate.lastIndexOf(",");
    if (cut <= 0) return text;
    candidate = candidate.slice(0, cut);
    const balanced = balance(candidate);
    try {
      parse(balanced);
      return balanced;
    } catch {
      // Still inside a broken argument. Keep trimming.
    }
  }
  return text;
}

/** Repairs to try, in order, before giving up on a line (ir-spec Part 12, item 6). */
export const repairs: ((line: string) => string)[] = [
  (l) => l,
  balance,
  doubleQuotes,
  placeholders,
  (l) => balance(doubleQuotes(l)),
  (l) => balance(doubleQuotes(placeholders(l))),
  (l) => balance(doubleQuotes(placeholders(l.replace(/,\s*\)/g, ")")))),
  (l) => salvage(doubleQuotes(placeholders(l))),
];

export function stripFence(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```[a-z]*\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

export function lift(text: string): Lifted {
  const lines = stripFence(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const clauses: Expr[] = [];
  const rejected: { line: string; reason: string }[] = [];

  for (const line of lines) {
    const assignment = ASSIGNMENT.exec(line);
    const body = assignment ? assignment[2] : line;
    let value: Expr | undefined;
    let reason = "";
    for (const repair of repairs) {
      try {
        value = parse(repair(body));
        break;
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
      }
    }
    if (value === undefined) {
      rejected.push({ line, reason });
      continue;
    }
    // `$x = expr` becomes a binding scoping over everything after it, built up below.
    clauses.push(assignment ? c("Let", v(assignment[1]), value) : value);
  }

  if (!clauses.length) return { expression: undefined, clauses: 0, rejected };
  return { expression: scope(clauses), clauses: clauses.length, rejected };
}

/**
 * A binding is live for everything after it, in order (concept-spec Part 5.2). Flat lines
 * are surface sugar; nested scope is the core, and the lift is mechanical.
 */
function scope(clauses: Expr[]): Expr {
  const [first, ...rest] = clauses;
  const isBinding = typeof first === "object" && first !== null && "head" in first && first.head === "Let" && first.args.length === 2;

  if (!rest.length) return isBinding ? (first.args[1].value as Expr) : first;
  if (isBinding) {
    return call("Let", [
      { value: first.args[0].value },
      { value: first.args[1].value },
      { value: scope(rest) },
    ]);
  }
  const tail = scope(rest);
  const steps = typeof tail === "object" && tail !== null && "head" in tail && tail.head === "Sequence"
    ? tail.args.map((a) => a.value)
    : [tail];
  return c("Sequence", first, ...steps);
}
