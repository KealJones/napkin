/**
 * Code a message holds, read as Concepts by the language pack that reads it: TypeScript by
 * its reader (code/import.ts), any language with a Grammar(...) through tree-sitter
 * (code/tree.ts). Comments are kept where they were written, for hearing to hear and the
 * graph to reason over. A language the message names (a fence's ```python) is tried first;
 * otherwise every language a pack reads is tried, TypeScript first, and the first reading
 * with nothing unsupported is the one.
 */
import { type Expr, call, isCall } from "../concept/expression.js";
import { verbatimSpans } from "./parser/rules.js";
import { importSource, languagePackStore } from "../code/import.js";

/** Every language some pack says how to read, TypeScript first. */
function readable(): string[] {
  const store = languagePackStore();
  const withGrammar = store
    .all()
    .filter((u) => u.relations.some((r) => isCall(r.claim) && r.claim.head === "Grammar"))
    .map((u) => u.identity);
  return ["TypeScript", ...withGrammar];
}

const LANGUAGE: Record<string, string> = { ts: "TypeScript", typescript: "TypeScript", js: "TypeScript", javascript: "TypeScript", py: "Python", python: "Python" };

/** The code as Concepts, with the language it read as, or undefined when nothing reads it. */
export async function readCode(code: string, named?: string): Promise<{ ir: Expr; language: string } | undefined> {
  const first = named ? LANGUAGE[named.toLowerCase()] ?? named[0].toUpperCase() + named.slice(1) : undefined;
  const tried = first ? [first, ...readable().filter((l) => l !== first)] : readable();
  for (const language of tried) {
    try {
      const read = await importSource(code, language);
      if (read && !read.unsupported.length) return { ir: read.expression, language };
    } catch {
      // Not this language.
    }
  }
  return undefined;
}

/**
 * What in a text is kept as typed, cut out as `verbatim0` tokens (parser/rules.ts), with code
 * also read as Concepts: `InlineCode("foo()", ir=Module(Call($foo)), language=TypeScript())`.
 * Text shaped like code that no language reads is put back as words.
 */
export async function verbatim(text: string): Promise<{ text: string; spans: Expr[] }> {
  const kept = verbatimSpans(text);
  const spans: Expr[] = [];
  let said = kept.text;
  for (const [n, e] of kept.spans.entries()) {
    if (!isCall(e) || (e.head !== "InlineCode" && e.head !== "Block")) {
      spans.push(e);
      continue;
    }
    const code = e.args[e.args.length - 1]?.value;
    const lang = e.args.length > 1 ? e.args[0]?.value : undefined;
    const read = typeof code === "string" ? await readCode(code, typeof lang === "string" ? lang : undefined) : undefined;
    if (!read && kept.tentative.has(n)) said = said.replace(` verbatim${n} `, ` ${kept.tentative.get(n)} `);
    spans.push(read ? { head: e.head, args: [...e.args, { name: "ir", value: read.ir }, { name: "language", value: call(read.language, []) }] } : e);
  }
  return { text: said, spans };
}
