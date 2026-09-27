/**
 * TypeScript source into Concept expressions.
 *
 * The other half of `--as <Language>`: emission turns Concepts into source, and this turns
 * source into Concepts, so a program can be made of Concepts nobody typed by hand.
 *
 * How the language reads is not written here. It is the From rules of the language packs
 * (`packs/javascript.ncon`, and `packs/typescript.ncon` for what only TypeScript has),
 * applied to the syntax `code/read.ts` hands over. The appendix
 * `design/ir-spec-appendix-code.md` is the specification the rules answer to.
 *
 * Anything no rule reads becomes `Unsupported(kind, source)` rather than being dropped:
 * the same reason an absent Concept is a residual. A gap you can see is worth more than a
 * silence, and the import of a large file reports what it could not read.
 */
import type { Expr } from "../concept/expression.js";
import { ConceptStore } from "../store/store.js";
import { BUILT_IN_PACKS, loadPacks, seedPacks } from "./ncon.js";
import { readingRules, readWith } from "./rewrite.js";
import { readTree } from "./tree.js";
import { isCall } from "../concept/expression.js";
import { type Writing, writeWith, writingRules } from "./write.js";

export interface ImportOptions {
  /**
   * The store whose From rules read the source: a graph that has learned or been taught
   * rules reads with them. By default, the built-in language packs alone.
   */
  store?: ConceptStore;
}

export interface ImportResult {
  readonly expression: Expr;
  /** What had no mapping, so a large import reports its own gaps. */
  readonly unsupported: { kind: string; source: string }[];
}

let packsOnly: ConceptStore | undefined;
/** A store holding only the built-in language packs, for reading and writing without a graph. */
export const languagePackStore = (): ConceptStore => {
  if (!packsOnly) {
    packsOnly = new ConceptStore();
    const wanted = new Set(["core", "code", "javascript", "typescript", "python"]);
    seedPacks(packsOnly, loadPacks([BUILT_IN_PACKS]).filter((p) => wanted.has(p.name)));
  }
  return packsOnly;
};

/** Concepts written as JavaScript by the packs' To rules: what reads back as the same Concepts. */
export function writeJavaScript(expression: Expr, options: ImportOptions = {}): Writing {
  return writeWith(writingRules(options.store ?? languagePackStore(), "JavaScript"), expression);
}

/** One file of TypeScript as one `Module(...)` expression. */
export function importTypeScript(source: string, fileName = "input.ts", options: ImportOptions = {}): ImportResult {
  const rules = readingRules(options.store ?? languagePackStore(), "TypeScript");
  return readWith(rules, source, fileName);
}

/**
 * Source in a language its pack reads through tree-sitter (`Grammar("python")`,
 * `SyntaxPrefix("Py")` on the language's Concept) as one `Module(...)` expression. Undefined
 * when no pack says how to read the language.
 */
export async function importSource(source: string, language: string, options: ImportOptions = {}): Promise<ImportResult | undefined> {
  const store = options.store ?? languagePackStore();
  const said = (relation: string): string | undefined => {
    const r = store.get(language)?.relations.find((x) => isCall(x.claim) && x.claim.head === relation);
    const v = r && isCall(r.claim) ? r.claim.args[0]?.value : undefined;
    return typeof v === "string" ? v : undefined;
  };
  const grammar = said("Grammar");
  const prefix = said("SyntaxPrefix");
  if (grammar === undefined || prefix === undefined) return language === "TypeScript" || language === "JavaScript" ? importTypeScript(source, "input.ts", options) : undefined;
  const tree = await readTree(source, grammar, prefix);
  return readWith(readingRules(store, language), source, `input.${grammar}`, { tree, prefix });
}

/** Concepts written as source in a language, by its pack's To rules (and those it extends). */
export function writeSource(expression: Expr, language: string, options: ImportOptions = {}): Writing {
  return writeWith(writingRules(options.store ?? languagePackStore(), language), expression);
}

export interface CodeLanguage {
  readonly name: string;
  /** A pack says how its source reads as Concepts. */
  readonly reads: boolean;
  /** A pack says how Concepts are written as its source. */
  readonly writes: boolean;
}

/** The languages the packs read or write, from the packs themselves. */
export function codeLanguages(options: ImportOptions = {}): CodeLanguage[] {
  const store = options.store ?? languagePackStore();
  const languages = store
    .all()
    .filter((u) => u.relations.some((r) => isCall(r.claim) && r.claim.head === "IsA" && isCall(r.claim.args[0]?.value) && r.claim.args[0].value.head === "TargetLanguage"))
    .map((u) => u.identity);
  return languages
    .map((name) => ({
      name,
      reads: name === "TypeScript" || name === "JavaScript" || store.get(name)!.relations.some((r) => isCall(r.claim) && r.claim.head === "Grammar"),
      writes: writingRules(store, name).size > 0,
    }))
    .filter((l) => l.reads || l.writes);
}
