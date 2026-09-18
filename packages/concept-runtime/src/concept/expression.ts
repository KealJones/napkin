export type Primitive = string | number | boolean | null;

export interface VariableExpression {
  readonly variable: string;
}

export interface Argument {
  readonly name?: string;
  readonly value: Expr;
}

export interface ApplicationExpression {
  readonly apply: {
    readonly head: string;
    readonly args: readonly Argument[];
  };
}

export type Expr = Primitive | VariableExpression | ApplicationExpression;

export class ExpressionParseError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly position: number,
  ) {
    super(message + " at position " + position);
    this.name = "ExpressionParseError";
  }
}

class Parser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): Expr {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (!this.atEnd()) {
      this.fail("Unexpected input");
    }
    return value;
  }

  private parseValue(): Expr {
    this.skipWhitespace();
    const current = this.peek();
    if (current === '"') return this.parseString();
    if (current === "$") return this.parseVariable();
    if (current === "-" || this.isDigit(current)) return this.parseNumber();
    if (this.isIdentifierStart(current))
      return this.parseIdentifierOrApplication();
    this.fail("Expected a Concept application, variable, or primitive value");
  }

  private parseIdentifierOrApplication(): Expr {
    const head = this.parseIdentifier();
    this.skipWhitespace();

    if (this.peek() !== "(") {
      if (head === "true") return true;
      if (head === "false") return false;
      if (head === "null") return null;
      this.fail("Bare identifiers are not values; use a Concept application");
    }

    this.position += 1;
    const args: Argument[] = [];
    this.skipWhitespace();
    if (this.peek() === ")") {
      this.position += 1;
      return { apply: { head, args } };
    }

    while (true) {
      this.skipWhitespace();
      const named = this.tryParseArgumentName();
      const value = this.parseValue();
      args.push(named === undefined ? { value } : { name: named, value });
      this.skipWhitespace();

      if (this.peek() === ")") {
        this.position += 1;
        break;
      }
      if (this.peek() !== ",") this.fail("Expected ',' or ')'");
      this.position += 1;
    }

    return { apply: { head, args } };
  }

  private tryParseArgumentName(): string | undefined {
    const rest = this.source.slice(this.position);
    const match = /^[A-Za-z_][A-Za-z0-9_.-]*\s*=/.exec(rest);
    if (!match) return undefined;
    const name = match[0].slice(0, match[0].indexOf("=")).trim();
    this.position += match[0].length;
    return name;
  }

  private parseVariable(): VariableExpression {
    this.position += 1;
    const name = this.parseIdentifier();
    return { variable: name };
  }

  private parseNumber(): number {
    const rest = this.source.slice(this.position);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (!match) this.fail("Invalid number");
    this.position += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail("Number must be finite");
    return value;
  }

  private parseString(): string {
    const start = this.position;
    this.position += 1;
    let escaped = false;
    while (!this.atEnd()) {
      const character = this.source[this.position];
      this.position += 1;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        const raw = this.source.slice(start, this.position);
        try {
          const value: unknown = JSON.parse(raw);
          if (typeof value !== "string") this.fail("Expected a string");
          return value;
        } catch {
          this.fail("Invalid string escape");
        }
      }
    }
    this.fail("Unterminated string");
  }

  private parseIdentifier(): string {
    const rest = this.source.slice(this.position);
    const match = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(rest);
    if (!match) this.fail("Expected an identifier");
    this.position += match[0].length;
    return match[0];
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek() ?? "")) this.position += 1;
  }

  private peek(): string | undefined {
    return this.source[this.position];
  }

  private atEnd(): boolean {
    return this.position >= this.source.length;
  }

  private isDigit(value: string | undefined): boolean {
    return value !== undefined && value >= "0" && value <= "9";
  }

  private isIdentifierStart(value: string | undefined): boolean {
    return value !== undefined && /[A-Za-z_]/.test(value);
  }

  private fail(message: string): never {
    throw new ExpressionParseError(message, this.source, this.position);
  }
}

export function parseExpression(source: string): Expr {
  return new Parser(source).parse();
}

export function formatExpression(expression: Expr): string {
  if (expression === null) return "null";
  if (typeof expression === "string") return JSON.stringify(expression);
  if (typeof expression === "number" || typeof expression === "boolean") {
    return String(expression);
  }
  if ("variable" in expression) return "$" + expression.variable;

  const args = expression.apply.args.map((argument) => {
    const value = formatExpression(argument.value);
    return argument.name === undefined ? value : argument.name + "=" + value;
  });
  return expression.apply.head + "(" + args.join(", ") + ")";
}

export function isExpr(value: unknown): value is Expr {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 1 && typeof record.variable === "string") {
    return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(record.variable);
  }
  if (Object.keys(record).length !== 1 || typeof record.apply !== "object") {
    return false;
  }

  const application = record.apply as Record<string, unknown>;
  if (
    Object.keys(application).some((key) => key !== "head" && key !== "args") ||
    typeof application.head !== "string" ||
    !Array.isArray(application.args)
  ) {
    return false;
  }
  return application.args.every((argument: unknown) => {
    if (typeof argument !== "object" || argument === null) return false;
    const candidate = argument as Record<string, unknown>;
    if (
      Object.keys(candidate).some((key) => key !== "name" && key !== "value")
    ) {
      return false;
    }
    return (
      (candidate.name === undefined || typeof candidate.name === "string") &&
      "value" in candidate &&
      isExpr(candidate.value)
    );
  });
}

export function application(
  head: string,
  args: readonly Argument[] = [],
): ApplicationExpression {
  return { apply: { head, args } };
}

export function namedArgument(
  expression: Expr,
  name: string,
): Expr | undefined {
  if (!isApplication(expression)) return undefined;
  return expression.apply.args.find((argument) => argument.name === name)
    ?.value;
}

export function isApplication(
  expression: Expr,
): expression is ApplicationExpression {
  return (
    typeof expression === "object" &&
    expression !== null &&
    "apply" in expression
  );
}
