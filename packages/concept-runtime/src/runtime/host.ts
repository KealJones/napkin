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
  readonly kind: "name" | "number" | "text" | "comment" | "symbol" | "newline" | "indent" | "dedent" | "template" | "template-end" | "regex";
  /** A string's contents, a comment's words; a regular expression's source. */
  readonly value?: string;
  /** A regular expression's flags. */
  readonly flags?: string;
}

/**
 * Code's words by their shape alone (CodeApi.codeWords), the way `words` gives English's:
 * names, numbers (with any suffix, "3n", as typed), quoted text, comments, and symbols, the
 * longest of the `spellings` the graph knows first. What the language says is passed in: its
 * comment starts, whether indentation carries structure (`offside`, which gives Indent and
 * Dedent), which quote holds text with `${...}` inside (`templates`: its pieces of text and
 * what is inside each `${`, between a "template" and a "template-end"), and whether a "/"
 * where a thing can start begins a regular expression (`regex`). A line break is a word only
 * between two things that could each end and start a statement. No word's role is named
 * here; the graph hears them.
 */
export function codeWords(
  text: string,
  options: { spellings?: readonly string[]; comments?: readonly string[]; offside?: boolean; templates?: string; regex?: boolean; regexAfter?: readonly string[] } = {},
): CodeWord[] {
  const spellings = [...(options.spellings ?? [])].sort((a, b) => b.length - a.length);
  const comments = options.comments ?? [];
  const out: CodeWord[] = [];
  const indents = [0];
  const opens = "([{";
  const closes = ")]}";
  let depth = 0;
  let lineStart = true;
  let i = 0;
  // Inside a template's ${...}: how many braces deep, so its closing } goes back to the text.
  const interpolations: number[] = [];
  const ends = () => {
    const last = out[out.length - 1];
    return (
      !!last &&
      (last.kind === "name" || last.kind === "number" || last.kind === "text" || last.kind === "regex" || last.kind === "template-end" || (last.kind === "symbol" && closes.includes(last.text)))
    );
  };
  let pendingBreak = false;
  const push = (w: CodeWord) => {
    // A break between an end and a start separates them; anywhere else it is layout.
    const starts =
      w.kind === "name" || w.kind === "number" || w.kind === "text" || w.kind === "comment" || w.kind === "template" || w.kind === "regex" || (w.kind === "symbol" && opens.includes(w.text));
    if (pendingBreak && depth === 0 && !interpolations.length && ends() && starts) out.push({ text: "\n", kind: "newline" });
    pendingBreak = false;
    out.push(w);
  };
  const at = (re: RegExp): string | undefined => {
    re.lastIndex = i;
    const m = re.exec(text);
    return m ? m[0] : undefined;
  };
  const LEAD = /[ \t]*/y;
  const NUMBER = /(0[xob][0-9a-f_]+|\d[\d_]*(\.\d*)?([eE][+-]?\d+)?)[A-Za-z]*/iy;
  const NAME = /[\p{L}_$][\p{L}\p{N}_$]*/uy;
  const QUOTE = /"""|'''|"|'|`/y;
  const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => ({ n: "\n", t: "\t", r: "\r" })[c] ?? c);
  // A template's text up to its end or its next ${.
  const templateText = () => {
    const q = options.templates!;
    let k = i;
    while (k < text.length && !text.startsWith(q, k) && !text.startsWith("${", k)) k += text[k] === "\\" ? 2 : 1;
    push({ text: text.slice(i, k), kind: "text", value: unescape(text.slice(i, k)) });
    i = k;
    if (text.startsWith("${", i)) {
      push({ text: "${", kind: "symbol" });
      interpolations.push(0);
      i += 2;
    } else {
      push({ text: q, kind: "template-end" });
      i += q.length;
    }
  };
  while (i < text.length) {
    if (options.offside && lineStart && depth === 0) {
      const lead = at(LEAD) ?? "";
      const k = i + lead.length;
      if (text[k] === "\n" || k >= text.length) {
        i = k + 1;
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
      i = k;
      continue;
    }
    const ch = text[i];
    if (ch === "\n") {
      pendingBreak = true;
      lineStart = true;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || /\s/.test(ch)) {
      i += 1;
      continue;
    }
    const comment = comments.find((c) => text.startsWith(c, i));
    if (comment) {
      const block = comment === "/*";
      const end = block ? text.indexOf("*/", i + 2) : text.indexOf("\n", i);
      const stop = end < 0 ? text.length : block ? end + 2 : end;
      const said = text.slice(i, stop);
      push({ text: said, kind: "comment", value: (block ? said.slice(2, -2) : said.slice(comment.length)).trim() });
      i = stop;
      continue;
    }
    if (options.templates && text.startsWith(options.templates, i)) {
      push({ text: options.templates, kind: "template" });
      i += options.templates.length;
      templateText();
      continue;
    }
    if (interpolations.length && ch === "}" && interpolations[interpolations.length - 1] === 0) {
      interpolations.pop();
      push({ text: "}", kind: "symbol" });
      i += 1;
      templateText();
      continue;
    }
    const quote = at(QUOTE);
    if (quote) {
      let k = i + quote.length;
      while (k < text.length && !text.startsWith(quote, k)) k += text[k] === "\\" ? 2 : 1;
      const said = text.slice(i, k + quote.length);
      push({ text: said, kind: "text", value: unescape(said.slice(quote.length, -quote.length)) });
      i += said.length;
      continue;
    }
    const last = out[out.length - 1];
    if (options.regex && ch === "/" && (!ends() || (last?.kind === "name" && (options.regexAfter ?? []).includes(last.text)))) {
      let k = i + 1;
      let inClass = false;
      while (k < text.length && text[k] !== "\n" && (inClass || text[k] !== "/")) {
        if (text[k] === "\\") k += 1;
        else if (text[k] === "[") inClass = true;
        else if (text[k] === "]") inClass = false;
        k += 1;
      }
      if (text[k] === "/") {
        const flags = /[a-z]*/y;
        flags.lastIndex = k + 1;
        const f = flags.exec(text)![0];
        push({ text: text.slice(i, k + 1 + f.length), kind: "regex", value: text.slice(i + 1, k), flags: f });
        i = k + 1 + f.length;
        continue;
      }
    }
    const number = at(NUMBER);
    if (number) {
      push({ text: number, kind: "number" });
      i += number.length;
      continue;
    }
    const name = at(NAME);
    if (name) {
      push({ text: name, kind: "name" });
      i += name.length;
      continue;
    }
    const symbol = spellings.find((s) => text.startsWith(s, i)) ?? ch;
    if (interpolations.length && symbol === "{") interpolations[interpolations.length - 1]++;
    if (interpolations.length && symbol === "}") interpolations[interpolations.length - 1]--;
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
