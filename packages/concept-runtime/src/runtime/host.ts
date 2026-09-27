/**
 * The one place a Concept value becomes a JavaScript value and back, for this host's own
 * implementation of the code primitives (ir-spec 10.8). A Rust host has its own.
 *
 *   Undefined()                     undefined
 *   List(a, b)                      [a, b], its elements converted too
 *   Record(k=v, ...)                { k: v, ... }, a plain object; Argument(...) too
 *   Instant(ms)                     a Date at that instant
 *   Regex("p", "flags")             a RegExp
 *   MutableSet(ref)                 a Set of what its cell holds
 *   MutableMap(ref)                 a Map of what its cell holds, Pairs
 * Any other Concept is itself: an expression passes through as the object it is.
 */
import nlp from "compromise";
import { exists, home, moduleFile, mtime, read, resolve, runtimeRoot } from "#platform";
import { type Call, type Expr, call, isCall } from "../concept/expression.js";
import type { CellStore } from "../store/cells.js";

const isExprObject = (v: unknown): v is Call =>
  typeof v === "object" && v !== null && typeof (v as Call).head === "string" && Array.isArray((v as Call).args);

const U = (): Call => call("Undefined");

export function toHost(v: unknown, cells?: CellStore): unknown {
  if (!isCall(v as Expr)) return v;
  const e = v as Call;
  if (e.head === "Undefined" && !e.args.length) return undefined;
  if (e.head === "List") return e.args.map((a) => toHost(a.value, cells));
  if (e.head === "Record" || e.head === "Argument") return Object.fromEntries(e.args.map((a) => [a.name ?? "", toHost(a.value, cells)]));
  if (e.head === "Instant" && typeof e.args[0]?.value === "number") return new Date(e.args[0].value);
  if (e.head === "Regex" && typeof e.args[0]?.value === "string") return new RegExp(e.args[0].value, String(e.args[1]?.value ?? ""));
  // A Set or a Map is its members, held in a cell because it can change.
  const ref = e.args[0]?.value;
  const held = isCall(ref as Expr) && (ref as Call).head === "CellRef";
  if (e.head === "MutableSet" && cells && held) return new Set(toHost(cells.read(ref as Expr), cells) as unknown[]);
  if (e.head === "MutableMap" && cells && held) return new Map((toHost(cells.read(ref as Expr), cells) as Call[]).map((p) => [toHost(p.args[0]?.value, cells), toHost(p.args[1]?.value, cells)]));
  return e;
}

const READABLE = [resolve(runtimeRoot, "data"), resolve(home(), ".napkin")];
const texts = new Map<string, { at: number; text: string }>();

/** A text file under the data directory or ~/.napkin, cached until it changes (CodeApi.readText). */
export function readText(path: string): string | undefined {
  const full = resolve(READABLE[0], "..", path);
  const at = [full, resolve(path)].find((p) => READABLE.some((root) => p.startsWith(root + "/")) && exists(p));
  if (at === undefined) return undefined;
  const changed = mtime(at);
  const held = texts.get(at);
  if (held && held.at === changed) return held.text;
  const text = read(at);
  if (text === undefined) return undefined;
  texts.set(at, { at: changed, text });
  return text;
}

const lemmas = new Map<string, string>();

/** A word's base form, by the tagger the Ears already reads with (CodeApi.lemma). */
export function lemma(word: string): string {
  const w = word.toLowerCase();
  const held = lemmas.get(w);
  if (held !== undefined) return held;
  const d = nlp(w);
  const base = d.verbs().toInfinitive().text() || d.nouns().toSingular().text() || w;
  lemmas.set(w, base.toLowerCase());
  return base.toLowerCase();
}

/**
 * A text's words in order, each with the sentence it is in and what the tagger proposes it
 * is (CodeApi.words), and what it could be alone. A contraction is its words: "there's" is "there" and "is", each kept
 * with what was typed. Proposals, not facts: hearing weighs them (design/prompt-hearing.md).
 */
/** What a word is taken to be alone, out of any sentence: "kill" is a verb. */
const alone = new Map<string, string[]>();
function aloneTags(word: string): string[] {
  const w = word.toLowerCase();
  if (!alone.has(w)) alone.set(w, [...((nlp(w).terms().json() as { terms: { tags: string[] }[] }[])[0]?.terms[0]?.tags ?? [])]);
  return alone.get(w)!;
}

export function words(text: string): { text: string; typed: string; tags: string[]; sentence: number; after: string; could: string[] }[] {
  const out: { text: string; typed: string; tags: string[]; sentence: number; after: string; could: string[] }[] = [];
  const sentences = nlp(text).sentences().json() as { terms: { text: string; implicit?: string; post?: string; tags: string[] }[] }[];
  sentences.forEach((s, sentence) => {
    for (const term of s.terms) {
      const said = term.implicit || term.text;
      // What was typed after the word, punctuation included: a "?" asks.
      // `could`: what the word is alone, which the sentence may have tagged away ("did hamlet
      // kill" tags kill a noun; alone it is a verb).
      if (said) out.push({ text: said, typed: term.text, tags: [...term.tags], sentence, after: (term.post ?? "").trim(), could: aloneTags(said) });
    }
  });
  return out;
}

export interface CodeWord {
  readonly text: string;
  readonly kind: "name" | "number" | "text" | "comment" | "symbol" | "newline" | "indent" | "dedent";
  /** A string's contents, a comment's words. */
  readonly value?: string;
}

/**
 * Code's words by their shape alone (CodeApi.codeWords), the way `words` gives English's:
 * names, numbers (with any suffix, "3n", as typed), quoted text, comments, and symbols, the
 * longest of the `spellings` the graph knows first. What the language says is passed in: its
 * comment starts, and whether indentation carries structure (`offside`), which gives Indent
 * and Dedent. A line break is a word only between two things that could each end and start
 * a statement. No word's role is named here; the graph hears them.
 */
export function codeWords(text: string, options: { spellings?: readonly string[]; comments?: readonly string[]; offside?: boolean } = {}): CodeWord[] {
  const spellings = [...(options.spellings ?? [])].sort((a, b) => b.length - a.length);
  const comments = options.comments ?? [];
  const out: CodeWord[] = [];
  const indents = [0];
  const opens = "([{";
  const closes = ")]}";
  let depth = 0;
  let lineStart = true;
  let i = 0;
  const ends = () => {
    const last = out[out.length - 1];
    return !!last && (last.kind === "name" || last.kind === "number" || last.kind === "text" || (last.kind === "symbol" && closes.includes(last.text)));
  };
  let pendingBreak = false;
  const push = (w: CodeWord) => {
    // A break between an end and a start separates them; anywhere else it is layout.
    if (pendingBreak && depth === 0 && ends() && (w.kind === "name" || w.kind === "number" || w.kind === "text" || w.kind === "comment" || (w.kind === "symbol" && opens.includes(w.text)))) out.push({ text: "\n", kind: "newline" });
    pendingBreak = false;
    out.push(w);
  };
  while (i < text.length) {
    if (options.offside && lineStart && depth === 0) {
      const lead = /^[ \t]*/.exec(text.slice(i))![0];
      const rest = text.slice(i + lead.length);
      if (rest.startsWith("\n") || rest === "") {
        i += lead.length + (rest === "" ? 0 : 1);
        if (rest === "") break;
        continue;
      }
      const col = lead.replace(/\t/g, "        ").length;
      if (col > indents[indents.length - 1]) {
        indents.push(col);
        pendingBreak = false;
        out.push({ text: "", kind: "indent" });
      }
      while (col < indents[indents.length - 1]) {
        indents.pop();
        if (ends()) out.push({ text: "\n", kind: "newline" });
        pendingBreak = false;
        out.push({ text: "", kind: "dedent" });
      }
      lineStart = false;
      i += lead.length;
      continue;
    }
    const ch = text[i];
    if (ch === "\n") {
      pendingBreak = true;
      lineStart = true;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const rest = text.slice(i);
    const comment = comments.find((c) => rest.startsWith(c));
    if (comment) {
      const block = comment === "/*";
      const end = block ? rest.indexOf("*/") + 2 : rest.indexOf("\n");
      const said = end <= (block ? 1 : -1) ? rest : rest.slice(0, end);
      push({ text: said, kind: "comment", value: (block ? said.slice(2, -2) : said.slice(comment.length)).trim() });
      i += said.length;
      continue;
    }
    const quote = /^("""|'''|"|'|`)/.exec(rest);
    if (quote) {
      const q = quote[1];
      let k = q.length;
      while (k < rest.length && !rest.startsWith(q, k)) k += rest[k] === "\\" ? 2 : 1;
      const said = rest.slice(0, k + q.length);
      const value = said.slice(q.length, -q.length).replace(/\\(.)/g, (_, c: string) => ({ n: "\n", t: "\t" })[c] ?? c);
      push({ text: said, kind: "text", value });
      i += said.length;
      continue;
    }
    const number = /^(0[xob][0-9a-f_]+|\d[\d_]*(\.\d*)?([eE][+-]?\d+)?)[A-Za-z]*/i.exec(rest);
    if (number) {
      push({ text: number[0], kind: "number" });
      i += number[0].length;
      continue;
    }
    const name = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(rest);
    if (name) {
      push({ text: name[0], kind: "name" });
      i += name[0].length;
      continue;
    }
    const symbol = spellings.find((s) => rest.startsWith(s)) ?? ch;
    if (opens.includes(symbol) && (options.offside || symbol !== "{")) depth += 1;
    if (closes.includes(symbol) && (options.offside || symbol !== "}")) depth = Math.max(0, depth - 1);
    push({ text: symbol, kind: "symbol" });
    i += symbol.length;
  }
  if (options.offside) {
    if (ends()) out.push({ text: "\n", kind: "newline" });
    while (indents.length > 1) {
      indents.pop();
      out.push({ text: "", kind: "dedent" });
    }
  }
  return out;
}

let english: Set<string> | undefined;

/** A name, as opposed to a word: Berlin, Greg, Keal, but not bolt or apple (CodeApi.properNoun). */
export function properNoun(word: string): boolean {
  const w = word.toLowerCase();
  english ??= new Set(JSON.parse(read(moduleFile("an-array-of-english-words/index.json")) ?? "[]") as string[]);
  return nlp(w).has("#ProperNoun") || !english.has(w);
}

export function fromHost(v: unknown): Expr {
  if (v === undefined) return U();
  if (v === null || typeof v === "string" || typeof v === "boolean") return v as Expr;
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return call("List", v.map((x) => ({ value: fromHost(x) })));
  if (v instanceof Date) return call("Instant", [{ value: v.getTime() }]);
  if (v instanceof RegExp) return call("Regex", [{ value: v.source }, { value: v.flags }]);
  if (v instanceof Set) return call("List", [...v].map((x) => ({ value: fromHost(x) })));
  if (v instanceof Map) return call("List", [...v].map(([k, x]) => ({ value: call("Pair", [{ value: fromHost(k) }, { value: fromHost(x) }]) })));
  if (isExprObject(v)) return v;
  if (typeof v === "object" && "variable" in (v as object)) return v as Expr;
  if (typeof v === "object") {
    return call("Record", Object.entries(v as object).filter(([, x]) => typeof x !== "function").map(([name, x]) => ({ name, value: fromHost(x) })));
  }
  throw new Error(`No Concept holds a ${typeof v}`);
}
