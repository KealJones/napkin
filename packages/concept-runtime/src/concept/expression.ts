/**
 * The Concept expression language.
 *
 * Grammar (design/ir-spec.md Part 3):
 *   expr     := number | string | boolean | null | variable | call
 *   variable := "$" name
 *   call     := Head "(" [ arg { "," arg } ] ")"
 *   arg      := [ name "=" ] expr
 *
 * A string is JSON-quoted, or raw between triple quotes (`"""..."""`, no escapes, for source
 * held as text). `//` starts a comment that runs to the end of the line.
 *
 * There is no list syntax, no object syntax, and no infix operators. Collections are
 * Concepts; keyed collections use the named arguments the grammar already has.
 */

export type Primitive = string | number | boolean | null;

export interface Variable {
  readonly variable: string;
}

export interface Argument {
  readonly name?: string;
  readonly value: Expr;
}

export interface Call {
  readonly head: string;
  readonly args: readonly Argument[];
}

export type Expr = Primitive | Variable | Call;

export const isVariable = (e: Expr): e is Variable =>
  typeof e === "object" && e !== null && "variable" in e;

export const isCall = (e: Expr): e is Call =>
  typeof e === "object" && e !== null && "head" in e;

export const call = (head: string, args: readonly Argument[] = []): Call => ({ head, args });
export const arg = (value: Expr, name?: string): Argument =>
  name === undefined ? { value } : { name, value };
export const v = (name: string): Variable => ({ variable: name });

/** Positional call, the common case. */
export const c = (head: string, ...values: Expr[]): Call =>
  call(head, values.map((value) => ({ value })));

export class ParseError extends Error {
  constructor(message: string, readonly source: string, readonly position: number) {
    super(`${message} at position ${position}`);
    this.name = "ParseError";
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const ARG_NAME = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/;

class Parser {
  private i = 0;
  constructor(private readonly src: string) {}

  parse(): Expr {
    const value = this.value();
    this.ws();
    if (this.i !== this.src.length) this.fail("Unexpected trailing input");
    return value;
  }

  /** Every expression in the source, one after another, as a `.ncon` file holds them. */
  parseMany(): Expr[] {
    const out: Expr[] = [];
    for (this.ws(); this.i < this.src.length; this.ws()) out.push(this.value());
    return out;
  }

  private value(): Expr {
    this.ws();
    const ch = this.src[this.i];
    if (ch === undefined) this.fail("Unexpected end of input");
    if (this.src.startsWith('"""', this.i)) return this.raw();
    if (ch === '"') return this.string();
    if (ch === "$") return this.variable();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.number();
    if (/[A-Za-z_]/.test(ch)) return this.identifierOrCall();
    this.fail(`Unexpected ${JSON.stringify(ch)}`);
  }

  private identifierOrCall(): Expr {
    const name = this.identifier();
    this.ws();
    if (this.src[this.i] !== "(") {
      if (name === "true") return true;
      if (name === "false") return false;
      if (name === "null") return null;
      this.fail(
        `Bare identifier ${JSON.stringify(name)} is not a value; every name must be Capitalized and followed by parentheses`,
      );
    }
    if (!/^[A-Z]/.test(name)) {
      this.fail(`Head ${JSON.stringify(name)} must start with a capital letter`);
    }
    this.i += 1;
    const args: Argument[] = [];
    this.ws();
    if (this.src[this.i] === ")") {
      this.i += 1;
      return call(name, args);
    }
    for (;;) {
      this.ws();
      const named = ARG_NAME.exec(this.src.slice(this.i));
      let argName: string | undefined;
      if (named) {
        argName = named[1];
        this.i += named[0].length;
      }
      args.push(arg(this.value(), argName));
      this.ws();
      if (this.src[this.i] === ")") {
        this.i += 1;
        break;
      }
      if (this.src[this.i] !== ",") this.fail("Expected ',' or ')'");
      this.i += 1;
    }
    return call(name, args);
  }

  private variable(): Variable {
    this.i += 1;
    return v(this.identifier());
  }

  private identifier(): string {
    const m = IDENT.exec(this.src.slice(this.i));
    if (!m) this.fail("Expected a name");
    this.i += m[0].length;
    return m[0];
  }

  private number(): number {
    const m = NUMBER.exec(this.src.slice(this.i));
    if (!m) this.fail("Invalid number");
    this.i += m[0].length;
    const value = Number(m[0]);
    if (!Number.isFinite(value)) this.fail("Number must be finite");
    return value;
  }

  private string(): string {
    const start = this.i;
    this.i += 1;
    let escaped = false;
    while (this.i < this.src.length) {
      const ch = this.src[this.i++];
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        try {
          return JSON.parse(this.src.slice(start, this.i)) as string;
        } catch {
          this.fail("Invalid string escape");
        }
      }
    }
    this.fail("Unterminated string");
  }

  private raw(): string {
    const end = this.src.indexOf('"""', this.i + 3);
    if (end < 0) this.fail("Unterminated raw string");
    const text = this.src.slice(this.i + 3, end);
    this.i = end + 3;
    return text;
  }

  private ws(): void {
    for (;;) {
      while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i += 1;
      if (!this.src.startsWith("//", this.i)) return;
      const end = this.src.indexOf("\n", this.i);
      this.i = end < 0 ? this.src.length : end + 1;
    }
  }

  private fail(message: string): never {
    throw new ParseError(message, this.src, this.i);
  }
}

export const parse = (source: string): Expr => new Parser(source).parse();
export const parseMany = (source: string): Expr[] => new Parser(source).parseMany();

export function format(e: Expr): string {
  if (e === null) return "null";
  if (typeof e === "string") return JSON.stringify(e);
  if (typeof e === "number" || typeof e === "boolean") return String(e);
  if (isVariable(e)) return "$" + e.variable;
  const args = e.args.map((a) =>
    a.name === undefined ? format(a.value) : `${a.name}=${format(a.value)}`,
  );
  return `${e.head}(${args.join(", ")})`;
}

/** Structural equality. */
export function equal(a: Expr, b: Expr): boolean {
  if (isCall(a)) {
    if (!isCall(b) || a.head !== b.head || a.args.length !== b.args.length) return false;
    return a.args.every((x, i) => x.name === b.args[i].name && equal(x.value, b.args[i].value));
  }
  if (isVariable(a)) return isVariable(b) && a.variable === b.variable;
  return Object.is(a, b);
}

export function depth(e: Expr): number {
  return isCall(e) ? 1 + Math.max(0, ...e.args.map((a) => depth(a.value))) : 0;
}

export function heads(e: Expr, acc = new Set<string>()): Set<string> {
  if (!isCall(e)) return acc;
  acc.add(e.head);
  for (const a of e.args) heads(a.value, acc);
  return acc;
}

/** Walk every sub-expression, outermost first. */
export function* walk(e: Expr): Generator<Expr> {
  yield e;
  if (isCall(e)) for (const a of e.args) yield* walk(a.value);
}

export const named = (e: Expr, name: string): Expr | undefined =>
  isCall(e) ? e.args.find((a) => a.name === name)?.value : undefined;

/** Is this a well-formed expression? Used when accepting one from outside. */
export function isExpr(value: unknown): value is Expr {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1 && typeof record.variable === "string") {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(record.variable);
  }
  if (typeof record.head !== "string" || !Array.isArray(record.args)) return false;
  if (!/^[A-Z]/.test(record.head)) return false;
  return record.args.every((a: unknown) => {
    if (typeof a !== "object" || a === null) return false;
    const argument = a as Record<string, unknown>;
    if (Object.keys(argument).some((k) => k !== "name" && k !== "value")) return false;
    return (
      (argument.name === undefined || typeof argument.name === "string") &&
      "value" in argument &&
      isExpr(argument.value)
    );
  });
}

/** Positional arguments, ignoring names. */
export const positional = (e: Call): Expr[] => e.args.map((a) => a.value);
