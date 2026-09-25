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
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nlp from "compromise";
import { createRequire } from "node:module";
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

const READABLE = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../data"),
  resolve(process.env.HOME ?? "", ".napkin"),
];
const texts = new Map<string, { at: number; text: string }>();

/** A text file under the data directory or ~/.napkin, cached until it changes (CodeApi.readText). */
export function readText(path: string): string | undefined {
  const full = resolve(READABLE[0], "..", path);
  const at = [full, resolve(path)].find((p) => READABLE.some((root) => p.startsWith(root + "/")) && existsSync(p));
  if (at === undefined) return undefined;
  const changed = statSync(at).mtimeMs;
  const held = texts.get(at);
  if (held && held.at === changed) return held.text;
  const text = readFileSync(at, "utf8");
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
 * is (CodeApi.words). A contraction is its words: "there's" is "there" and "is", each kept
 * with what was typed. Proposals, not facts: hearing weighs them (design/prompt-hearing.md).
 */
export function words(text: string): { text: string; typed: string; tags: string[]; sentence: number; after: string }[] {
  const out: { text: string; typed: string; tags: string[]; sentence: number; after: string }[] = [];
  const sentences = nlp(text).sentences().json() as { terms: { text: string; implicit?: string; post?: string; tags: string[] }[] }[];
  sentences.forEach((s, sentence) => {
    for (const term of s.terms) {
      const said = term.implicit || term.text;
      // What was typed after the word, punctuation included: a "?" asks.
      if (said) out.push({ text: said, typed: term.text, tags: [...term.tags], sentence, after: (term.post ?? "").trim() });
    }
  });
  return out;
}

let english: Set<string> | undefined;

/** A name, as opposed to a word: Berlin, Greg, Keal, but not bolt or apple (CodeApi.properNoun). */
export function properNoun(word: string): boolean {
  const w = word.toLowerCase();
  english ??= new Set(createRequire(import.meta.url)("an-array-of-english-words") as string[]);
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
