/**
 * TypeScript source into Concept expressions.
 *
 * The other half of `--as <Language>`: emission turns Concepts into source, and nothing
 * turned source into Concepts. Without this the only Concepts a program could be made of
 * are ones somebody typed by hand.
 *
 * The target vocabulary is not invented here. `design/ir-spec-appendix-code.md` already
 * translates a full page of the runtime node for node — 43 distinct constructs — and this
 * produces exactly that shape, so the appendix is the specification and the test.
 *
 * TypeScript hands over its own AST, so this is a translator rather than a parser.
 *
 * Types are erased. A type annotation is a claim about a value, not a step the program
 * takes, and nothing downstream can act on one yet. Erasure is recorded here rather than
 * discovered later (`design/self-hosting.md` Part 6).
 *
 * Anything with no mapping becomes `Unsupported(kind, source)` rather than being dropped.
 * The same reason an absent Concept is a residual: a gap you can see is worth more than a
 * silence, and the import of a large file should report what it could not read.
 */
import ts from "typescript";
import { type Expr, arg, call, c, isCall as isCallExpr, v } from "../concept/expression.js";

const UNDEFINED = c("Undefined");

/** Binary operators, onto the appendix's names. */
const BINARY: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "Equals",
  [ts.SyntaxKind.EqualsEqualsToken]: "Equals",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "NotEquals",
  [ts.SyntaxKind.ExclamationEqualsToken]: "NotEquals",
  [ts.SyntaxKind.PlusToken]: "Add",
  [ts.SyntaxKind.MinusToken]: "Sub",
  [ts.SyntaxKind.AsteriskToken]: "Multiply",
  [ts.SyntaxKind.SlashToken]: "Divide",
  [ts.SyntaxKind.PercentToken]: "Modulo",
  [ts.SyntaxKind.GreaterThanToken]: "GreaterThan",
  [ts.SyntaxKind.LessThanToken]: "LessThan",
  [ts.SyntaxKind.GreaterThanEqualsToken]: "AtLeast",
  [ts.SyntaxKind.LessThanEqualsToken]: "AtMost",
  [ts.SyntaxKind.AmpersandAmpersandToken]: "And",
  [ts.SyntaxKind.BarBarToken]: "Or",
  [ts.SyntaxKind.QuestionQuestionToken]: "Otherwise",
  [ts.SyntaxKind.InKeyword]: "In",
  [ts.SyntaxKind.InstanceOfKeyword]: "InstanceOf",
  [ts.SyntaxKind.AmpersandToken]: "BitAnd",
  [ts.SyntaxKind.BarToken]: "BitOr",
  [ts.SyntaxKind.CaretToken]: "BitXor",
  [ts.SyntaxKind.LessThanLessThanToken]: "ShiftLeft",
  [ts.SyntaxKind.GreaterThanGreaterThanToken]: "ShiftRight",
  [ts.SyntaxKind.AsteriskAsteriskToken]: "Power",
};

/** `x += 1` is `x = x + 1`. Compound assignment carries no meaning the IR needs. */
const COMPOUND: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.PlusEqualsToken]: "Add",
  [ts.SyntaxKind.MinusEqualsToken]: "Sub",
  [ts.SyntaxKind.AsteriskEqualsToken]: "Multiply",
  [ts.SyntaxKind.SlashEqualsToken]: "Divide",
};

export interface ImportOptions {
  /**
   * Callees whose single string argument is really source code, not data.
   *
   * `code(`(args) => ...`)` is a function inside a string literal. Left alone it imports
   * as an opaque string, which makes the import look complete while a third of the seed
   * -- 350 lines of real behaviour -- passes through untranslated. Named here, the string
   * is imported too and appears as `Embedded(...)`, which says it was source text in the
   * original and can be written back out as one.
   */
  embedded?: readonly string[];
}

export interface ImportResult {
  readonly expression: Expr;
  /** What had no mapping, so a large import reports its own gaps. */
  readonly unsupported: { kind: string; source: string }[];
}

class Importer {
  readonly unsupported: { kind: string; source: string }[] = [];
  constructor(
    private readonly file: ts.SourceFile,
    private readonly embedded: readonly string[] = ["code"],
  ) {}

  /** Source held in a string literal, translated in place. */
  private embed(text: string): Expr {
    const inner = importTypeScript(text, `${this.file.fileName}#embedded`, { embedded: this.embedded });
    this.unsupported.push(...inner.unsupported);
    const module = inner.expression;
    // A lone expression comes back wrapped in Module; unwrap it so `Embedded` holds the
    // function rather than a module containing one.
    const only =
      isCallExpr(module) && module.head === "Module" && module.args.length === 1
        ? module.args[0]!.value
        : module;
    return c("Embedded", only);
  }

  private unknown(node: ts.Node): Expr {
    const kind = ts.SyntaxKind[node.kind];
    const source = node.getText(this.file).slice(0, 120);
    this.unsupported.push({ kind, source });
    return c("Unsupported", kind, source);
  }

  /** Several statements are a Sequence; one is itself. A block never adds a wrapper. */
  private body(statements: readonly ts.Statement[]): Expr {
    const steps = statements.map((s) => this.statement(s)).filter((s) => s !== undefined);
    if (!steps.length) return UNDEFINED;
    if (steps.length === 1) return steps[0]!;
    return call("Sequence", steps.map((value) => ({ value })));
  }

  private name(node: ts.Node): string {
    return node.getText(this.file);
  }

  private params(parameters: readonly ts.ParameterDeclaration[]): Expr {
    return call("List", parameters.map((p) => ({ value: this.binding(p.name) })));
  }

  /** A destructuring parameter keeps its shape, so the caller can still be read. */
  private binding(node: ts.BindingName): Expr {
    if (ts.isIdentifier(node)) return v(this.name(node));
    if (ts.isObjectBindingPattern(node)) {
      return call(
        "Object",
        node.elements.map((e) => arg(this.binding(e.name), this.name(e.propertyName ?? e.name))),
      );
    }
    return call(
      "List",
      node.elements.map((e) => ({
        value: ts.isOmittedExpression(e) ? UNDEFINED : this.binding(e.name),
      })),
    );
  }

  private fn(node: ts.FunctionLikeDeclaration, named: boolean): Expr {
    // A concise arrow body is the value, not a return statement, and the appendix writes
    // it without one. Only a block can return.
    const body = node.body
      ? ts.isBlock(node.body)
        ? this.body(node.body.statements)
        : this.expression(node.body)
      : UNDEFINED;
    const shape = named && node.name
      ? c("Func", v(this.name(node.name)), this.params(node.parameters), body)
      : c("Lambda", this.params(node.parameters), body);
    // Async and Generator wrap the function, not its parameter list (appendix, Vocabulary).
    let out = shape;
    if (node.asteriskToken) out = c("Generator", out);
    if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) out = c("Async", out);
    return out;
  }

  private declarations(list: ts.VariableDeclarationList): Expr {
    // `const` binds; `let` and `var` may be reassigned, and the IR keeps the difference.
    const head = list.flags & ts.NodeFlags.Const ? "Let" : "Var";
    const parts = list.declarations.map((d) =>
      c(head, this.binding(d.name), d.initializer ? this.expression(d.initializer) : UNDEFINED),
    );
    return parts.length === 1 ? parts[0]! : call("Sequence", parts.map((value) => ({ value })));
  }

  /** Modifiers wrap what they modify, the way Async wraps a function. */
  private decorate(node: ts.Node, inner: Expr): Expr {
    let out = inner;
    const has = (k: ts.SyntaxKind): boolean =>
      ts.canHaveModifiers(node) ? (ts.getModifiers(node)?.some((m) => m.kind === k) ?? false) : false;
    if (has(ts.SyntaxKind.ReadonlyKeyword)) out = c("Readonly", out);
    if (has(ts.SyntaxKind.PrivateKeyword)) out = c("Private", out);
    if (has(ts.SyntaxKind.StaticKeyword)) out = c("Static", out);
    return out;
  }

  private classDeclaration(node: ts.ClassDeclaration): Expr {
    const base = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
    const extended = base?.types[0]
      ? c("Extends", this.expression(base.types[0].expression))
      : UNDEFINED;

    const members = node.members
      .map((m): Expr | undefined => {
        if (ts.isConstructorDeclaration(m)) {
          // A parameter property declares a field and assigns it; both are kept.
          const fields = m.parameters
            .filter((p) => ts.canHaveModifiers(p) && (ts.getModifiers(p)?.length ?? 0) > 0)
            .map((p) => this.decorate(p, c("Field", this.name(p.name))));
          const body = m.body ? this.body(m.body.statements) : UNDEFINED;
          const ctor = c("Constructor", this.params(m.parameters), body);
          return fields.length ? call("Sequence", [...fields, ctor].map((value) => ({ value }))) : ctor;
        }
        if (ts.isPropertyDeclaration(m)) {
          const value = m.initializer ? this.expression(m.initializer) : UNDEFINED;
          return this.decorate(m, c("Field", this.name(m.name), value));
        }
        if (ts.isMethodDeclaration(m)) {
          const body = m.body ? this.body(m.body.statements) : UNDEFINED;
          let method: Expr = c("Method", this.name(m.name), this.params(m.parameters), body);
          if (m.modifiers?.some((x) => x.kind === ts.SyntaxKind.AsyncKeyword)) method = c("Async", method);
          if (m.asteriskToken) method = c("Generator", method);
          return this.decorate(m, method);
        }
        if (ts.isGetAccessor(m)) {
          return this.decorate(m, c("Getter", this.name(m.name), m.body ? this.body(m.body.statements) : UNDEFINED));
        }
        if (ts.isSetAccessor(m)) {
          return this.decorate(
            m,
            c("Setter", this.name(m.name), this.params(m.parameters), m.body ? this.body(m.body.statements) : UNDEFINED),
          );
        }
        // An index signature or a bare property signature is type-only.
        if (ts.isIndexSignatureDeclaration(m) || ts.isPropertySignature(m)) return undefined;
        return this.unknown(m);
      })
      .filter((m): m is Expr => m !== undefined);

    return c(
      "Class",
      node.name ? v(this.name(node.name)) : UNDEFINED,
      extended,
      call("List", members.map((value) => ({ value }))),
    );
  }

  statement(node: ts.Statement): Expr | undefined {
    // Types are claims about values, not steps. Erased, deliberately.
    if (
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      return undefined;
    }

    const exported = ts.canHaveModifiers(node)
      ? ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    const wrap = (e: Expr): Expr => (exported ? c("Export", e) : e);

    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const names: Expr[] = [];
      if (clause?.name) names.push(v(this.name(clause.name)));
      if (clause?.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const e of clause.namedBindings.elements) names.push(v(this.name(e.name)));
        } else {
          names.push(v(this.name(clause.namedBindings.name)));
        }
      }
      const from = (node.moduleSpecifier as ts.StringLiteral).text;
      return c("Import", call("List", names.map((value) => ({ value }))), from);
    }

    if (ts.isVariableStatement(node)) return wrap(this.declarations(node.declarationList));
    if (ts.isFunctionDeclaration(node)) return wrap(this.fn(node, true));
    if (ts.isClassDeclaration(node)) return wrap(this.classDeclaration(node));
    if (ts.isExpressionStatement(node)) return this.expression(node.expression);
    if (ts.isReturnStatement(node)) {
      return node.expression ? c("Return", this.expression(node.expression)) : c("Return");
    }
    if (ts.isIfStatement(node)) {
      return c(
        "If",
        this.expression(node.expression),
        this.statement(node.thenStatement) ?? UNDEFINED,
        node.elseStatement ? (this.statement(node.elseStatement) ?? UNDEFINED) : UNDEFINED,
      );
    }
    if (ts.isBlock(node)) return this.body(node.statements);
    if (ts.isThrowStatement(node)) return c("Throw", this.expression(node.expression));
    if (ts.isTryStatement(node)) {
      const handler = node.catchClause;
      const caught = handler?.variableDeclaration
        ? c("Catch", this.binding(handler.variableDeclaration.name), this.body(handler.block.statements))
        : handler
          ? c("Catch", v("_"), this.body(handler.block.statements))
          : UNDEFINED;
      const attempt = c("Try", this.body(node.tryBlock.statements), caught);
      return node.finallyBlock
        ? c("Finally", attempt, this.body(node.finallyBlock.statements))
        : attempt;
    }
    if (ts.isForOfStatement(node)) {
      const binding = ts.isVariableDeclarationList(node.initializer)
        ? this.binding(node.initializer.declarations[0]!.name)
        : this.expression(node.initializer as ts.Expression);
      return c(
        "ForOf",
        binding,
        this.expression(node.expression),
        this.statement(node.statement) ?? UNDEFINED,
      );
    }
    if (ts.isForStatement(node)) {
      const setup = node.initializer
        ? ts.isVariableDeclarationList(node.initializer)
          ? this.declarations(node.initializer)
          : this.expression(node.initializer)
        : UNDEFINED;
      return c(
        "For",
        setup,
        node.condition ? this.expression(node.condition) : true,
        node.incrementor ? this.expression(node.incrementor) : UNDEFINED,
        this.statement(node.statement) ?? UNDEFINED,
      );
    }
    if (ts.isWhileStatement(node)) {
      return c("While", this.expression(node.expression), this.statement(node.statement) ?? UNDEFINED);
    }
    if (node.kind === ts.SyntaxKind.ContinueStatement) return c("Continue");
    if (node.kind === ts.SyntaxKind.BreakStatement) return c("Break");
    if (ts.isExportDeclaration(node)) {
      // `export { a as b } from "x"` and `export * from "x"`: a re-export names things
      // without binding them, so it is not an Export wrapping a declaration.
      const from = node.moduleSpecifier ? (node.moduleSpecifier as ts.StringLiteral).text : undefined;
      const clause = node.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        const names = clause.elements.map((e) =>
          e.propertyName
            ? { value: c("As", v(this.name(e.propertyName)), this.name(e.name)) }
            : { value: v(this.name(e.name)) },
        );
        const list = call("List", names);
        return from === undefined ? c("ReExport", list) : c("ReExport", list, from);
      }
      return from === undefined ? c("ReExport", c("All")) : c("ReExport", c("All"), from);
    }
    if (ts.isExportAssignment(node)) return c("ExportDefault", this.expression(node.expression));
    return this.unknown(node);
  }

  expression(node: ts.Expression): Expr {
    // Type syntax carries nothing the IR keeps, so it is stepped through.
    if (ts.isParenthesizedExpression(node)) return this.expression(node.expression);
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) return this.expression(node.expression);
    if (ts.isNonNullExpression(node)) return this.expression(node.expression);
    if (ts.isSatisfiesExpression(node)) return this.expression(node.expression);

    if (ts.isIdentifier(node)) {
      const text = this.name(node);
      return text === "undefined" ? UNDEFINED : v(text);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (node.kind === ts.SyntaxKind.ThisKeyword) return c("This");
    if (node.kind === ts.SyntaxKind.SuperKeyword) return c("Super");

    if (ts.isTemplateExpression(node)) {
      // A template is concatenation, and Add covers string concatenation (appendix).
      let out: Expr = node.head.text;
      for (const span of node.templateSpans) {
        out = c("Add", out, this.expression(span.expression));
        if (span.literal.text) out = c("Add", out, span.literal.text);
      }
      return out;
    }

    if (ts.isPropertyAccessExpression(node)) {
      return c("Member", this.expression(node.expression), this.name(node.name));
    }
    if (ts.isElementAccessExpression(node)) {
      return c("Index", this.expression(node.expression), this.expression(node.argumentExpression));
    }
    if (ts.isCallExpression(node)) {
      // `import("x")` is a call whose callee is a keyword, not a value.
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return call("DynamicImport", node.arguments.map((a) => ({ value: this.expression(a) })));
      }
      const callee = ts.isIdentifier(node.expression) ? this.name(node.expression) : undefined;
      const wantsSource = callee !== undefined && this.embedded.includes(callee);
      return call("Call", [
        { value: this.expression(node.expression) },
        ...node.arguments.map((a) => {
          if (
            wantsSource &&
            (ts.isNoSubstitutionTemplateLiteral(a) || ts.isStringLiteral(a))
          ) {
            return { value: this.embed(a.text) };
          }
          return { value: this.expression(a) };
        }),
      ]);
    }
    if (ts.isNewExpression(node)) {
      return call("New", [
        { value: this.expression(node.expression) },
        ...(node.arguments ?? []).map((a) => ({ value: this.expression(a) })),
      ]);
    }
    if (ts.isAwaitExpression(node)) return c("Await", this.expression(node.expression));
    if (ts.isTypeOfExpression(node)) return c("TypeOf", this.expression(node.expression));
    if (ts.isSpreadElement(node)) return c("Spread", this.expression(node.expression));
    if (ts.isYieldExpression(node)) {
      const inner = node.expression ? this.expression(node.expression) : UNDEFINED;
      return node.asteriskToken ? c("YieldEach", inner) : c("Yield", inner);
    }
    if (ts.isVoidExpression(node)) return c("Void", this.expression(node.expression));
    if (ts.isRegularExpressionLiteral(node)) {
      // Source rather than semantics: a regular expression is its own little language, and
      // translating it would be translating that one too.
      const text = this.name(node);
      const end = text.lastIndexOf("/");
      return c("Regex", text.slice(1, end), text.slice(end + 1));
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return this.fn(node, false);

    if (ts.isConditionalExpression(node)) {
      return c(
        "If",
        this.expression(node.condition),
        this.expression(node.whenTrue),
        this.expression(node.whenFalse),
      );
    }

    if (ts.isPostfixUnaryExpression(node)) {
      // Postfix yields the value BEFORE the change, which is why this is not an Assign.
      const head = node.operator === ts.SyntaxKind.PlusPlusToken ? "PostIncrement" : "PostDecrement";
      return c(head, this.expression(node.operand));
    }
    if (ts.isPrefixUnaryExpression(node)) {
      if (node.operator === ts.SyntaxKind.PlusPlusToken) return c("PreIncrement", this.expression(node.operand));
      if (node.operator === ts.SyntaxKind.MinusMinusToken) return c("PreDecrement", this.expression(node.operand));
      if (node.operator === ts.SyntaxKind.TildeToken) return c("BitNot", this.expression(node.operand));
      if (node.operator === ts.SyntaxKind.ExclamationToken) return c("Not", this.expression(node.operand));
      if (node.operator === ts.SyntaxKind.MinusToken) return c("Negate", this.expression(node.operand));
      if (node.operator === ts.SyntaxKind.PlusToken) return this.expression(node.operand);
      return this.unknown(node);
    }

    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (kind === ts.SyntaxKind.EqualsToken) {
        return c("Assign", this.expression(node.left), this.expression(node.right));
      }
      const compound = COMPOUND[kind];
      if (compound) {
        const target = this.expression(node.left);
        return c("Assign", target, c(compound, target, this.expression(node.right)));
      }
      const head = BINARY[kind];
      if (head) return c(head, this.expression(node.left), this.expression(node.right));
      // `a, b` evaluates both and takes the second, which is what Sequence already means.
      if (kind === ts.SyntaxKind.CommaToken) {
        return c("Sequence", this.expression(node.left), this.expression(node.right));
      }
      return this.unknown(node);
    }

    if (ts.isArrayLiteralExpression(node)) {
      return call("List", node.elements.map((e) => ({ value: this.expression(e) })));
    }

    if (ts.isObjectLiteralExpression(node)) {
      // A known identifier key is a named argument; anything computed keeps Pair
      // (ir-spec Part 3.3, and the appendix's own Vocabulary note).
      const args = node.properties.map((p) => {
        if (ts.isShorthandPropertyAssignment(p)) {
          return arg(v(this.name(p.name)), this.name(p.name));
        }
        if (ts.isSpreadAssignment(p)) return arg(c("Spread", this.expression(p.expression)));
        if (!ts.isPropertyAssignment(p)) return arg(this.unknown(p));
        if (ts.isIdentifier(p.name)) return arg(this.expression(p.initializer), this.name(p.name));
        if (ts.isStringLiteral(p.name) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name.text)) {
          return arg(this.expression(p.initializer), p.name.text);
        }
        const key = ts.isComputedPropertyName(p.name)
          ? this.expression(p.name.expression)
          : (p.name as ts.StringLiteral).text;
        return arg(c("Pair", key, this.expression(p.initializer)));
      });
      return call("Object", args);
    }

    return this.unknown(node);
  }

  module(): Expr {
    return c("Module", this.body(this.file.statements));
  }
}

/** One file of TypeScript as one `Module(...)` expression. */
export function importTypeScript(
  source: string,
  fileName = "input.ts",
  options: ImportOptions = {},
): ImportResult {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const importer = new Importer(file, options.embedded ?? ["code"]);
  return { expression: importer.module(), unsupported: importer.unsupported };
}
