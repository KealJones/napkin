/**
 * Source in any language tree-sitter has a grammar for, as syntax nodes for a language
 * pack's From rules to read (code/rewrite.ts), the way code/read.ts does for TypeScript.
 *
 * Like read.ts it says nothing about what any construct means. A node is `<Prefix><Type>`,
 * named by the grammar's own node type (`function_definition` in Python is
 * `PyFunctionDefinition`), with its fields as named arguments and its other children, comments
 * among them, in order. A token the grammar does not name ("+", "def") is
 * `<Prefix>Token(text="+")`. An identifier keeps its text; a number, a string, true, false and
 * none are their values.
 *
 * A comment is kept where it was written. Where the grammar sets one beside a block (Python's
 * `def f():  # ...` or a comment on the line before the body) it is moved to the front of
 * that block, so it stays among the statements it is about.
 */
import { exists, moduleFile } from "#platform";
import { type Argument, type Expr, call } from "../concept/expression.js";

/** Loaded when first needed, and never bundled: a browser host without it reads no grammar. */
const TREE_SITTER = "web-tree-sitter";
const grammarFile = (grammar: string): string => moduleFile(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);

type Node = {
  type: string;
  text: string;
  isNamed: boolean;
  childCount: number;
  child(i: number): Node | null;
  childForFieldName?(name: string): Node | null;
};
type Language = { fieldNameForId(id: number): string | null };
type Parser = { setLanguage(l: Language): void; parse(text: string): { rootNode: Node & { walk(): Cursor } } };
type Cursor = { gotoFirstChild(): boolean; gotoNextSibling(): boolean; gotoParent(): boolean; readonly currentNode: Node; readonly currentFieldName: string | null };

let ready: Promise<{ Parser: new () => Parser; load: (path: string) => Promise<Language> }> | undefined;
const languages = new Map<string, Promise<Language>>();

async function parserFor(grammar: string): Promise<Parser> {
  ready ??= (async () => {
    const loaded = (await import(/* @vite-ignore */ TREE_SITTER)) as { default?: unknown };
    const TreeSitter = (loaded.default ?? loaded) as { init(): Promise<void>; Language: { load(p: string): Promise<Language> } } & (new () => Parser);
    await TreeSitter.init();
    return { Parser: TreeSitter as unknown as new () => Parser, load: (p: string) => TreeSitter.Language.load(p) };
  })();
  const ts = await ready;
  if (!languages.has(grammar)) languages.set(grammar, ts.load(grammarFile(grammar)));
  const parser = new ts.Parser();
  parser.setLanguage(await languages.get(grammar)!);
  return parser;
}

const camel = (type: string): string =>
  type
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");

/** Whether tree-sitter has a grammar by this name ("python", "rust", "bash"). */
export function hasGrammar(grammar: string): boolean {
  try {
    return exists(grammarFile(grammar));
  } catch {
    return false;
  }
}

/** Source as syntax nodes named `<prefix><Type>`, for From rules. */
export async function readTree(text: string, grammar: string, prefix: string): Promise<Expr> {
  const parser = await parserFor(grammar);
  const root = parser.parse(text).rootNode;
  const cursor = root.walk();

  const leaf = (n: Node): Expr | undefined => {
    if (/comment/.test(n.type)) return call(`${prefix}Comment`, [{ name: "text", value: n.text.replace(/^(#|\/\/|--|;+)\s?|^\/\*|\*\/$/g, "").trim() }]);
    if (/^(integer|float|number|int_literal|float_literal|integer_literal|decimal_integer_literal)$/.test(n.type)) return Number(n.text.replace(/_/g, ""));
    if (/^(true|false)$/.test(n.type)) return n.type === "true";
    if (/^(none|null|nil)$/.test(n.type)) return null;
    if (/^string/.test(n.type) && n.isNamed) {
      const content: string[] = [];
      for (let i = 0; i < n.childCount; i += 1) {
        const c = n.child(i);
        if (c && /content|fragment/.test(c.type)) content.push(c.text);
      }
      return content.length ? content.join("") : n.text.replace(/^[rbuf]*("""|'''|"|'|`)|("""|'''|"|'|`)$/gi, "");
    }
    return undefined;
  };

  const read = (): Expr => {
    const n = cursor.currentNode;
    const value = leaf(n);
    if (value !== undefined) return value;
    if (!n.isNamed) return call(`${prefix}Token`, [{ name: "text", value: n.text }]);
    const fields: Argument[] = [];
    const rest: Expr[] = [];
    if (cursor.gotoFirstChild()) {
      do {
        const field = cursor.currentFieldName;
        const named = cursor.currentNode.isNamed;
        const child = read();
        if (field) fields.push({ name: field, value: child });
        else if (named) rest.push(child);
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    } else {
      return call(`${prefix}${camel(n.type)}`, [{ name: "text", value: n.text }]);
    }
    // A comment beside a block goes to the front of it.
    const comments = rest.filter((e) => typeof e === "object" && e !== null && "head" in e && e.head === `${prefix}Comment`);
    const body = fields.find((f) => typeof f.value === "object" && f.value !== null && "head" in f.value && f.value.head === `${prefix}Block`);
    if (comments.length && body && typeof body.value === "object" && body.value !== null && "head" in body.value) {
      const block = call(body.value.head, [...comments.map((value) => ({ value })), ...body.value.args]);
      const moved = fields.map((f) => (f === body ? { name: f.name, value: block } : f));
      return call(`${prefix}${camel(n.type)}`, [...moved, ...rest.filter((e) => !comments.includes(e)).map((value) => ({ value }))]);
    }
    return call(`${prefix}${camel(n.type)}`, [...fields, ...rest.map((value) => ({ value }))]);
  };
  return read();
}
