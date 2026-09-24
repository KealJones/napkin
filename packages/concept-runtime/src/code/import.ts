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
const languageStore = (): ConceptStore => {
  if (!packsOnly) {
    packsOnly = new ConceptStore();
    const wanted = new Set(["core", "code", "javascript", "typescript"]);
    seedPacks(packsOnly, loadPacks([BUILT_IN_PACKS]).filter((p) => wanted.has(p.name)));
  }
  return packsOnly;
};

/** One file of TypeScript as one `Module(...)` expression. */
export function importTypeScript(source: string, fileName = "input.ts", options: ImportOptions = {}): ImportResult {
  const rules = readingRules(options.store ?? languageStore(), "TypeScript");
  return readWith(rules, source, fileName);
}
