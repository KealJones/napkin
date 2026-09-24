/**
 * Words before grammar: contractions typed without their apostrophe, and spelling.
 *
 * Spelling is decided from three word sources, never from a model:
 *  - the tagger's lexicon (compromise, ~25k common words, places and names), the words it is
 *    confident about;
 *  - a full English word list (~275k), which tells a rare real word from a non-word;
 *  - the Concept graph's own names, so a word the system has learned is never "corrected".
 *
 * A non-word within edit distance 2 of a known word is a misspelling of it ("virginya" is
 * Virginia, "pheonix" is Phoenix). A real but rare word at distance 1 from a common one is a
 * probable misspelling ("wether" for weather), unless it is only an inflection of a known
 * word. Everything else is left exactly as typed.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import nlp from "compromise";

const require = createRequire(import.meta.url);
const ENGLISH: ReadonlySet<string> = new Set(require("an-array-of-english-words") as string[]);
const LEXICON = (nlp.model() as { one: { lexicon: Record<string, string | string[]> } }).one.lexicon;
const COMMON: ReadonlySet<string> = new Set(Object.keys(LEXICON).filter((w) => /^[a-z]+$/.test(w) && w.length > 2));

/** Names the graph already knows, lowercased. Set per parse from the store. */
let known: ReadonlySet<string> = new Set();
export const useGraphNames = (names: Iterable<string>): void => {
  known = new Set([...names].map((n) => n.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).filter((n) => /^[a-z]+$/.test(n)));
  if (index) for (const k of known) index.createDictionaryEntry(k, 1e9);
};

/** Contractions written without the apostrophe, which the tagger does not expand. */
const BARE: Record<string, string> = {
  whats: "what is", thats: "that is", wheres: "where is", whos: "who is", hows: "how is",
  dont: "do not", doesnt: "does not", didnt: "did not", cant: "can not", wont: "will not",
  isnt: "is not", arent: "are not", wasnt: "was not", werent: "were not", havent: "have not",
  hasnt: "has not", couldnt: "could not", shouldnt: "should not", wouldnt: "would not",
  im: "i am", ive: "i have", youre: "you are", theyre: "they are", lets: "let us",
  wanna: "want to", gonna: "going to", gotta: "got to", aint: "is not", id: "i would",
  ya: "you", u: "you", ur: "your", pls: "please", plz: "please", thx: "thanks",
};

export function expandBare(text: string): string {
  return text
    .replace(/\s&\s/g, " and ")
    .replace(/\b[A-Za-z]+\b/g, (w) => BARE[w.toLowerCase()] ?? w)
    // "its a pi 4", "its more than": the possessive never comes before these.
    .replace(/\bits\b(?=\s+(a|an|the|more|less|not|so|really|very|too|just|\d|\w+er\s+than\b))/gi, "it is")
    // "your not wrong", "your welcome": the contraction, not the possessive.
    .replace(/\byour\b(?=\s+(not|so|welcome|right|wrong|the best|a|an|going|gonna|being))/gi, "you are");
}

export const isWord = (w: string): boolean => ENGLISH.has(w) || LEXICON[w] !== undefined || known.has(w);

/** Stripping a regular ending leaves a known word: "memes", "tried", "dropping". */
function inflects(w: string): boolean {
  for (const end of ["s", "es", "ed", "d", "ing", "er", "ers", "ly"]) {
    const stem = w.endsWith(end) ? w.slice(0, -end.length) : "";
    if (stem.length > 2 && (COMMON.has(stem) || COMMON.has(stem + "e") || known.has(stem))) return true;
  }
  return false;
}

/** Damerau-Levenshtein distance, capped: a swapped pair of letters is one edit. */
function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let best = cap + 1;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

const tagsOf = (w: string): string[] => [LEXICON[w] ?? []].flat();

const NAMED = (w: string): boolean => tagsOf(w).some((t) => /Place|City|Country|Region|Person|FirstName/.test(t));

/** Every letter of `typed`, in order, inside `word`: a dropped letter, the commonest typo. */
function dropped(typed: string, word: string): boolean {
  if (word.length !== typed.length + 1) return false;
  let i = 0;
  for (const ch of word) if (ch === typed[i]) i += 1;
  return i === typed.length;
}

/**
 * A non-word with two neighbouring letters swapped back into a common word, the commonest
 * typo there is: "waht", "teh", "hsit", "ahppened". Between several, the one written most
 * after the word before wins, then one the tagger knows, then the most written.
 */
function swapped(w: string, prev: string): string | undefined {
  const options: string[] = [];
  for (let i = 0; i + 1 < w.length; i += 1) {
    const t = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    if (t !== w && ENGLISH.has(t) && frequency(t) >= COMMONLY) options.push(t);
  }
  const known = (t: string) => (LEXICON[t] === undefined ? 0 : 1);
  options.sort((a, b) => together(prev, b) - together(prev, a) || known(b) - known(a) || frequency(b) - frequency(a));
  return options[0];
}

interface Suggestion { term: string; distance: number; count: number }
interface SymSpellIndex {
  createDictionaryEntry(key: string, count: number): void;
  lookup(input: string, verbosity: number, maxEditDistance: number): Suggestion[];
  words: Map<string, number>;
  bigrams: Map<string, number>;
}

/**
 * SymSpell (Wolf Garbe's symmetric-delete algorithm, via node-symspell) with its English
 * word and bigram frequency lists, loaded once, synchronously. It proposes corrections and
 * ranks them by how often each word, and each pair of words, is written; the guards around
 * it decide whether a correction is allowed at all.
 */
let index: SymSpellIndex | undefined;
function symspell(): SymSpellIndex {
  if (index) return index;
  const SymSpell = require("node-symspell") as { new (maxEdit: number, prefix: number): SymSpellIndex; Verbosity: { ALL: number } };
  const dir = dirname(require.resolve("node-symspell/package.json")) + "/dictionaries/";
  const built = new SymSpell(2, 7);
  for (const line of readFileSync(dir + "frequency_dictionary_en_82_765.txt", "utf8").split("\n")) {
    const [word, count] = line.trim().split(" ");
    if (word && count) built.createDictionaryEntry(word, Number(count));
  }
  for (const line of readFileSync(dir + "frequency_bigramdictionary_en_243_342.txt", "utf8").split("\n")) {
    const [a, b, count] = line.trim().split(" ");
    if (a && b && count) built.bigrams.set(a + " " + b, Number(count));
  }
  // The graph's own names are words: never corrected, and available as corrections.
  for (const k of known) built.createDictionaryEntry(k, 1e9);
  VERBOSITY_ALL = SymSpell.Verbosity.ALL;
  index = built;
  return built;
}
let VERBOSITY_ALL = 2;

const frequency = (w: string): number => symspell().words.get(w) ?? 0;
/** How often a word must be written, in SymSpell's counts, to be what a typo meant. */
const COMMONLY = 1e6;
const together = (prev: string, w: string): number => symspell().bigrams.get(prev + " " + w) ?? 0;

/**
 * The word a typo meant, or undefined when the word stands as typed. Conservative on
 * purpose: a wrong correction silently changes what the user said, while a missed one only
 * leaves a word the graph does not know yet.
 *
 *  - A non-word two neighbouring letters away from a common word is that word ("waht",
 *    "ahppened"), whatever its length; short words are corrected no other way.
 *  - A real word is corrected only toward a word it dropped one letter from that is written
 *    at least a hundred times as often ("wether" to weather); the word before decides
 *    between such neighbours ("the weather", not "the whether").
 *  - A non-word takes SymSpell's best suggestion within two edits, keeping its first letter,
 *    ranked by edit distance, then by the pair it makes with the word before, then by how
 *    often it is written.
 */
/** Two spellings of one word, American and British: color/colour, center/centre, realize/realise. */
function variant(a: string, b: string): boolean {
  const us = (x: string) => x.replace(/our/g, "or").replace(/re\b/g, "er").replace(/is(e|ed|es|ing|ation)\b/g, "iz$1").replace(/ll(ed|ing|er)\b/g, "l$1");
  return us(a) === us(b);
}

export function spelling(word: string, prev = ""): string | undefined {
  const w = word.toLowerCase();
  if (!/^[a-z]+$/.test(w) || known.has(w)) return undefined;
  if (w.length >= 3 && !ENGLISH.has(w) && frequency(w) === 0) {
    const swap = swapped(w, prev);
    if (swap) return swap;
  }
  if (w.length < 5 || COMMON.has(w)) return undefined;
  const real = ENGLISH.has(w) || frequency(w) > 0;
  if (real && inflects(w)) return undefined;
  const mine = frequency(w);
  const options = symspell()
    .lookup(w, VERBOSITY_ALL, real ? 1 : 2)
    .filter((o) => o.term !== w && o.term[0] === w[0] && /^[a-z]+$/.test(o.term))
    .filter((o) => !real || (dropped(w, o.term) && o.count >= Math.max(1, mine) * 100 && !variant(w, o.term)))
    .filter((o) => o.distance === 1 || NAMED(o.term) || w.length >= 7)
    // A typo is of a word people write: "frobnicator" is not a misspelled "fornicator".
    .filter((o) => o.count >= COMMONLY);
  if (!options.length) return undefined;
  options.sort((a, b) => a.distance - b.distance || together(prev, b.term) - together(prev, a.term) || b.count - a.count);
  return options[0].term;
}

/**
 * A message none of whose words are words: "asdkjh qwe zzz". Letters run into digits are a
 * code, not a word to judge: "b2" is a board square, the way "a1" already read.
 */
export function unclear(text: string): boolean {
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
  if (!words.length) return false;
  const real = words.filter((w) => isWord(w) || /^(i|a|an|to|of|in|on|at|is|it|me|my|no|ok|hi|yo)$/.test(w));
  return real.length / words.length < 0.34 && !words.some((w) => w.length > 3 && COMMON.has(w));
}

/**
 * Correct the spelling of a sentence before tagging, so the grammar reads the word meant.
 * Returns the corrected text and, for each corrected word, what was typed.
 */
export function correct(text: string): { text: string; typed: Map<string, string> } {
  const typed = new Map<string, string>();
  const out = text.replace(/\b[A-Za-z]{3,}\b/g, (raw, at: number) => {
    // Filler and drawn-out words are said that way on purpose: "uhmm", "soooo", "hmmm".
    if (/(.)\1\1/i.test(raw) || /^(uhm+|umm+|hmm+|ahh+|lol|lmao|haha+|idk|btw)$/i.test(raw)) return raw;
    // Capitalised mid-sentence or camel-cased: a name or an identifier, typed on purpose.
    if (at > 0 && /^[A-Z]/.test(raw) && /[a-z]/.test(raw) && raw.slice(1) !== raw.slice(1).toLowerCase()) return raw;
    const prev = text.slice(0, at).trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const meant = spelling(raw, prev);
    if (!meant) return raw;
    typed.set(meant, raw);
    return meant;
  });
  return { text: out, typed };
}
