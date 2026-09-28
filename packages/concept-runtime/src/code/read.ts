/**
 * JavaScript and TypeScript source as syntax nodes, for a language pack's From rules to
 * read (code/rewrite.ts, packs/javascript.ncon).
 *
 * The only language-specific host code on the way in. It says nothing about what any
 * construct means: every AST node becomes `Js<Kind>(field=child, ...)`, named by the
 * TypeScript compiler's own SyntaxKind and field names, the way a tree-sitter grammar names
 * its nodes. What those mean in Concepts is the pack's business.
 *
 * - An identifier is `JsIdentifier(text="x")`; a string, number, `true`, `false` or `null`
 *   is its value; a token or keyword is nullary, `JsPlusToken()`.
 * - A regular expression is `JsRegularExpressionLiteral(pattern=..., flags=...)`, and a
 *   declaration list says its `keyword=` (`const`, `let`, `var`), since neither is a child
 *   node in the compiler's tree.
 * - A type annotation is kept, `type=JsNumberKeyword()`, as are a type's own arguments,
 *   `Array<number>`: what type a declaration holds is the pack's to read. A declaration's
 *   type parameters are left out.
 */
import ts from "typescript";
import { type Argument, type Call, type Expr, call } from "../concept/expression.js";

/** SyntaxKind names without the First/Last aliases, which shadow the real names. */
const KIND = new Map<number, string>();
for (const [name, value] of Object.entries(ts.SyntaxKind)) {
  if (typeof value === "number" && !/^(First|Last)/.test(name)) KIND.set(value, name);
}
const kindName = (kind: number): string => KIND.get(kind) ?? String(kind);

/** Fields that are not the program: bookkeeping, and type parameters. */
const SKIP = new Set(["parent", "typeParameters", "jsDoc", "illegalDecorators", "original", "emitNode"]);

/** Fields holding a SyntaxKind number rather than a node. */
const KIND_FIELDS = new Set(["token", "operator", "keywordToken"]);

const node = (kind: number, args: Argument[] = []): Call => call(`Js${kindName(kind)}`, args);

export interface Read {
  readonly tree: Expr;
  /** Where each syntax node came from, for reporting one nothing reads. */
  readonly source: WeakMap<object, string>;
}

export function readSource(text: string, fileName = "input.ts"): Read {
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const source = new WeakMap<object, string>();

  const read = (n: ts.Node): Expr => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return node(n.kind, [{ name: "text", value: n.text }]);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) return n.text;
    if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (n.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isRegularExpressionLiteral(n)) {
      const end = n.text.lastIndexOf("/");
      return node(n.kind, [{ name: "pattern", value: n.text.slice(1, end) }, { name: "flags", value: n.text.slice(end + 1) }]);
    }
    const args: Argument[] = [];
    if (ts.isVariableDeclarationList(n)) {
      const keyword = n.flags & ts.NodeFlags.Const ? ts.SyntaxKind.ConstKeyword : n.flags & ts.NodeFlags.Let ? ts.SyntaxKind.LetKeyword : ts.SyntaxKind.VarKeyword;
      args.push({ name: "keyword", value: node(keyword) });
    }
    for (const [name, value] of Object.entries(n)) {
      if (SKIP.has(name) || value === undefined) continue;
      if (KIND_FIELDS.has(name) && typeof value === "number") args.push({ name, value: node(value) });
      else if (name === "statements" && isNodeArray(value)) args.push({ name, value: call("List", withComments(n, value)) });
      else if (isNodeArray(value)) args.push({ name, value: call("List", value.map((c) => ({ value: read(c) }))) });
      else if (isNode(value)) args.push({ name, value: read(value) });
    }
    const out = node(n.kind, args);
    source.set(out, n.getText(file).slice(0, 120));
    return out;
  };

  /**
   * A comment is where the writer said in words what the code does or is still to do, so it
   * is kept where it was written: `JsComment(text="loop over args here")` among the statements
   * it sits between, and after the last one when it closes a block.
   */
  const withComments = (owner: ts.Node, statements: ts.NodeArray<ts.Node>): Argument[] => {
    const out: Argument[] = [];
    // Between two statements there is only trivia, so every comment in the gap is one said
    // there: before the first statement, between each two, and before the closing brace.
    const gap = (from: number, to: number) => {
      for (const m of text.slice(from, to).matchAll(/\/\/([^\n]*)|\/\*([\s\S]*?)\*\//g)) {
        out.push({ value: call("JsComment", [{ name: "text", value: (m[1] ?? m[2] ?? "").trim() }]) });
      }
    };
    let at = statements.pos;
    for (const s of statements) {
      gap(at, s.getStart(file));
      out.push({ value: read(s) });
      at = s.end;
    }
    const braced = ts.isBlock(owner) || ts.isModuleBlock(owner);
    gap(at, ts.isSourceFile(owner) ? text.length : braced ? owner.end - 1 : owner.end);
    return out;
  };

  return { tree: read(file), source };
}

const isNode = (v: unknown): v is ts.Node =>
  typeof v === "object" && v !== null && typeof (v as ts.Node).kind === "number" && typeof (v as ts.Node).pos === "number" && !Array.isArray(v);

const isNodeArray = (v: unknown): v is ts.NodeArray<ts.Node> => Array.isArray(v) && typeof (v as unknown as ts.NodeArray<ts.Node>).pos === "number";
