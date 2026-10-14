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
import nlp from "compromise";
import SymSpell from "node-symspell";
import { moduleFile, read } from "#platform";

const ENGLISH: ReadonlySet<string> = new Set(JSON.parse(read(moduleFile("an-array-of-english-words/index.json")) ?? "[]") as string[]);
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

/** The words a contraction typed without its apostrophe stands for ("whats" is "what is"), else the word. */
export const unbare = (word: string): string => BARE[word.toLowerCase()] ?? word;

export function expandBare(text: string): string {
  return text
    .replace(/\s&\s/g, " and ")
    .replace(/\b[A-Za-z]+\b/g, (w) => BARE[w.toLowerCase()] ?? w)
    // "its a pi 4", "its more than": the possessive never comes before these.
    .replace(/\bits\b(?=\s+(a|an|the|more|less|not|so|really|very|too|just|\d|\w+er\s+than\b))/gi, "it is")
    // "your not wrong", "your welcome": the contraction, not the possessive.
    .replace(/\byour\b(?=\s+(not|so|welcome|right|wrong|the best|a|an|going|gonna|being))/gi, "you are");
}


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

type SymSpellIndex = SymSpell;

/**
 * SymSpell (Wolf Garbe's symmetric-delete algorithm, via node-symspell) with its English
 * word and bigram frequency lists, loaded once, synchronously. It proposes corrections and
 * ranks them by how often each word, and each pair of words, is written; the guards around
 * it decide whether a correction is allowed at all.
 */
let index: SymSpellIndex | undefined;
function symspell(): SymSpellIndex {
  if (index) return index;
  const dictionary = (name: string) => read(moduleFile(`node-symspell/dictionaries/${name}`)) ?? "";
  const built = new SymSpell(2, 7);
  for (const line of dictionary("frequency_dictionary_en_82_765.txt").split("\n")) {
    const [word, count] = line.trim().split(" ");
    if (word && count) built.createDictionaryEntry(word, Number(count));
  }
  for (const line of dictionary("frequency_bigramdictionary_en_243_342.txt").split("\n")) {
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
 * Correct the spelling of a sentence before tagging, so the grammar reads the word meant.
 * Returns the corrected text and, for each corrected word, what was typed.
 */
export function correct(text: string): { text: string; typed: Map<string, string> } {
  const typed = new Map<string, string>();
  const out = text.replace(/\b[A-Za-z]{3,}\b/g, (raw, at: number) => {
    // Filler and drawn-out words are said that way on purpose: "uhmm", "soooo", "hmmm".
    if (/(.)\1\1/i.test(raw) || /^(uhm+|umm+|hmm+|ahh+|lol|lmao|haha+|idk|btw)$/i.test(raw)) return raw;
    // Capitalised mid-sentence or camel-cased: a name or an identifier, typed on purpose.
    if (/[A-Z]/.test(raw.slice(1)) && /[a-z]/.test(raw)) return raw;
    const starts = at === 0 || /[.!?]\s*$/.test(text.slice(0, at));
    if (!starts && /^[A-Z][a-z]/.test(raw)) return raw;
    const prev = text.slice(0, at).trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const meant = spelling(raw, prev);
    if (!meant) return raw;
    // Corrected to a contraction written without its apostrophe ("wahts" to "whats"): the words
    // it stands for, as expandBare gives them before correction.
    const expanded = BARE[meant];
    typed.set(expanded ? expanded.split(" ")[0] : meant, raw);
    return expanded ?? meant;
  });
  return { text: out, typed };
}

/**
 * Every way a word could have been meant, for the readings to choose among by how well each
 * fits the words around it (resolve/readings.ts). Nothing is decided here: `spelling` above
 * picks one correction before anything is heard; this proposes several and lets what the graph
 * can do with each decide.
 *
 *  - spelling: words within two edits, the graph's own names first, then common English;
 *  - join: the word and the next one typed as two ("pl us" is plus);
 *  - split: two words typed as one ("dividedby" is divided by).
 */
export interface Alternative {
  /** The words meant, in place of what was typed. */
  readonly text: string;
  /** How many typed words it stands for: two when it joins this word with the next. */
  readonly replaces: 1 | 2;
  readonly kind: "spelling" | "join" | "split";
  /** Letters changed; a join or a split changes one (the space). */
  readonly distance: number;
  /** A name the graph holds, so the graph can do something with it. */
  readonly graph: boolean;
  /** How much it speaks for itself as a word people write, 0 to 1 (`commonness`). */
  readonly common: number;
}

/** A word the graph names, or that English commonly has. */
const real = (w: string): boolean => known.has(w) || COMMON.has(w) || (ENGLISH.has(w) && frequency(w) >= COMMONLY);
/** Written often enough that it is taken as typed unless the graph says otherwise. */
const OFTEN = 1e7;
/** Whether the word needs no reading other than itself: the graph names it, or it is a word people write often. */
export const settled = (word: string): boolean => {
  const w = word.toLowerCase();
  // The tagger's lexicon alone does not settle a word: it holds forms it made itself ("minuss").
  return !/^[a-z]+$/.test(w) || known.has(w) || BARE[w] !== undefined || frequency(w) >= OFTEN || (COMMON.has(w) && NAMED(w));
};
/**
 * How much a word speaks for itself as what was meant, from how often it is written: nothing
 * below a million, all of it at a hundred million. A name the graph holds speaks fully.
 */
export const commonness = (word: string): number => {
  const w = word.toLowerCase();
  if (known.has(w)) return 1;
  const count = frequency(w);
  return count <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(count) - 6) / 2));
};

/** How much a word is written beside its neighbours, 0 to 1, over the sides it has one on: "what is" far more than "was is". */
export const beside = (prev: string, word: string, next: string): number => {
  const sides = [prev && together(prev.toLowerCase(), word.toLowerCase()), next && together(word.toLowerCase(), next.toLowerCase())].filter((x): x is number => typeof x === "number");
  return sides.length ? sides.reduce((sum, count) => sum + Math.min(1, Math.log10(1 + count) / 9.5), 0) / sides.length : 0;
};
/** A word English has, however rarely it is written. */
export const isWord = (word: string): boolean => ENGLISH.has(word.toLowerCase()) || frequency(word.toLowerCase()) > 0;

export function alternatives(word: string, prev = "", next = ""): Alternative[] {
  const w = word.toLowerCase();
  const out: Alternative[] = [];
  if (!/^[a-z]+$/.test(w)) return out;
  const seen = new Set<string>([w]);
  const add = (a: Omit<Alternative, "common">) => {
    if (seen.has(a.text + a.replaces)) return;
    seen.add(a.text + a.replaces);
    out.push({ ...a, common: Math.max(...a.text.split(" ").map(commonness)) });
  };
  const n = next.toLowerCase();
  // Typed as two: the pair is a word the graph names or English commonly has, and one half
  // alone is not a word people write.
  if (/^[a-z]+$/.test(n) && real(w + n) && (!settled(w) || !settled(n)) && (w.length <= 3 || n.length <= 3)) {
    add({ text: w + n, replaces: 2, kind: "join", distance: 1, graph: known.has(w + n) });
  }
  if (settled(w)) return out;
  const word_ = ENGLISH.has(w) || frequency(w) > 0;
  // What `spelling` would have decided alone, kept as one of the proposals.
  const old = spelling(word, prev);
  if (old) add({ text: old, replaces: 1, kind: "spelling", distance: Math.min(2, distance(w, old, 2)), graph: known.has(old) });
  // Typed as one: both halves are words, and the whole is not.
  if (!word_) {
    for (let i = 2; i <= w.length - 2; i++) {
      const a = w.slice(0, i);
      const b = w.slice(i);
      if (real(a) && real(b) && (known.has(a) || known.has(b))) add({ text: `${a} ${b}`, replaces: 1, kind: "split", distance: 1, graph: known.has(a) && known.has(b) });
    }
  }
  const mine = frequency(w);
  const options = symspell()
    .lookup(w, VERBOSITY_ALL, w.length >= 6 ? 2 : 1)
    .filter((o) => o.term !== w && /^[a-z]+$/.test(o.term) && (known.has(o.term) || o.count >= COMMONLY))
    // A real word, only rare: it is another word only when one a letter away is the graph's, or written far more.
    .filter((o) => !word_ || (o.distance === 1 && (known.has(o.term) || o.count >= mine * 100)))
    .sort((a, b) => a.distance - b.distance || Number(known.has(b.term)) - Number(known.has(a.term)) || together(prev, b.term) - together(prev, a.term) || b.count - a.count)
    .slice(0, 6);
  for (const o of options) add({ text: o.term, replaces: 1, kind: "spelling", distance: o.distance, graph: known.has(o.term) });
  return out;
}

/**
 * The forms a word may be inflected from, itself first: "directed" is direct, "movies" movie,
 * "studied" study. A regular ending is taken off only where what is left is a word English has
 * (as `inflects` decides), so "bed" is not b.
 */
export function bases(word: string): string[] {
  const w = word.toLowerCase();
  const out = [w];
  const add = (stem: string) => {
    if (stem.length > 2 && !out.includes(stem) && (COMMON.has(stem) || ENGLISH.has(stem) || known.has(stem))) out.push(stem);
  };
  for (const end of ["s", "es", "ed", "d", "ing", "ies", "ied"]) {
    if (!w.endsWith(end)) continue;
    const stem = w.slice(0, -end.length);
    if (end === "ies" || end === "ied") add(stem + "y");
    else {
      add(stem);
      add(stem + "e");
      // A doubled last letter: "stopped" is stop.
      if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2]) add(stem.slice(0, -1));
    }
  }
  return out;
}

/**
 * What a word nothing knows is, by where it stands: a word people write, misspelled ("bougth" is
 * bought), or a name ("maria bought 5 apples", however it is capitalised). Each is weighed by how
 * well it fits beside its neighbours in the bigram counts: a word by its own pairs, a name by the
 * pairs of every name the tagger's lexicon holds ("with maria", "maria said" are pairs names make;
 * "he zorped" is not). How it was written (a capital where a sentence does not start, a name the
 * lexicon has) counts for a name, never decides it alone.
 */
export interface SlotReading {
  readonly as: "name" | "word";
  /** The word meant: as typed for a name, or the word it is a misspelling of. */
  readonly text: string;
  readonly score: number;
}

const NAME_TAGS = /^(FirstName|MaleName|FemaleName|Person|LastName)$/;
const isName = (w: string): boolean => tagsOf(w).some((t) => NAME_TAGS.test(t));
/** What stands where a name stands: names, and the words that stand in for one ("she", "him"). */
const standsIn = (w: string): boolean => isName(w) || tagsOf(w).includes("Pronoun");
let pairs: { left: Map<string, number>; right: Map<string, number>; nameLeft: Map<string, number>; nameRight: Map<string, number>; total: number; names: number; least: number } | undefined;
/** What follows and what goes before each word, and how much of it is a name, from the bigram counts. */
export function pairCounts() {
  if (pairs) return pairs;
  const s = symspell();
  const left = new Map<string, number>(), right = new Map<string, number>(), nameLeft = new Map<string, number>(), nameRight = new Map<string, number>();
  for (const [k, n] of s.bigrams as Map<string, number>) {
    const [a, b] = k.split(" ") as [string, string];
    left.set(a, (left.get(a) ?? 0) + n);
    right.set(b, (right.get(b) ?? 0) + n);
    if (standsIn(b)) nameLeft.set(a, (nameLeft.get(a) ?? 0) + n);
    if (standsIn(a)) nameRight.set(b, (nameRight.get(b) ?? 0) + n);
  }
  let total = 0, names = 0, least = Infinity;
  for (const n of (s.bigrams as Map<string, number>).values()) if (n < least) least = n;
  for (const [w, n] of s.words as Map<string, number>) {
    total += n;
    if (standsIn(w)) names += n;
  }
  pairs = { left, right, nameLeft, nameRight, total, names, least };
  return pairs;
}

/**
 * How much more often than it is written at all a word (or any name) stands beside these
 * neighbours, as a log ratio over the sides it has (0: no telling either way).
 */
function fit(prev: string, next: string, own: { left: (p: string) => number; right: (n: string) => number; share: number }): number {
  const p = pairCounts();
  // A pair the list lacks was written fewer times than the least it keeps: about half of that.
  const missing = p.least / 2;
  const sides: number[] = [];
  const side = (seen: number, around: number) => Math.log((seen || missing) / Math.max(missing, around * own.share));
  if (prev && p.left.has(prev)) sides.push(side(own.left(prev), p.left.get(prev)!));
  if (next && p.right.has(next)) sides.push(side(own.right(next), p.right.get(next)!));
  return sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : 0;
}

export function slotReadings(word: string, prev = "", next = "", written: { capitalised?: boolean } = {}): SlotReading[] {
  const w = word.toLowerCase();
  if (!/^[a-z]+$/.test(w)) return [];
  const p = pairCounts();
  const s = symspell();
  // A number beside it is said as one: "5 aples" is "five aples", which the pairs know.
  const said = (x: string) => (/^\$?\d/.test(x) ? (Number(x.replace(/[^\d.]/g, "")) === 1 ? "one" : "five") : x.toLowerCase().replace(/[^a-z]/g, ""));
  const pv = said(prev);
  const nx = said(next);
  const out: SlotReading[] = [];
  const nameFit = fit(pv, nx, { left: (a) => p.nameLeft.get(a) ?? 0, right: (b) => p.nameRight.get(b) ?? 0, share: p.names / p.total });
  // A name is seldom what an unknown word is with nothing around it to say so.
  out.push({ as: "name", text: word, score: nameFit - 0.5 + (isName(w) ? 1.5 : 0) + (written.capitalised ? 0.7 : 0) + (isWord(w) ? -0.5 : 0) });
  const wordFit = (c: string) => fit(pv, nx, { left: (a) => s.bigrams.get(`${a} ${c}`) ?? 0, right: (b) => s.bigrams.get(`${c} ${b}`) ?? 0, share: Math.max(1, frequency(c)) / p.total });
  // As typed: a word people write, by its own pairs; else a word not known yet, with nothing for
  // or against it (what looking it up, or being told, is for).
  out.push({ as: "word", text: w, score: frequency(w) > 0 ? wordFit(w) : 0 });
  // Misspelled: each word a letter or two away, less for each letter changed.
  for (const a of alternatives(word, pv, nx)) if (a.kind === "spelling") out.push({ as: "word", text: a.text, score: wordFit(a.text) - a.distance + a.common });
  return out.sort((a, b) => b.score - a.score);
}

/** Whether a name fits where the word stands better than any word it could be. */
export const standsAsName = (word: string, prev = "", next = "", written: { capitalised?: boolean } = {}): boolean => {
  const best = slotReadings(word, prev, next, written)[0];
  return best?.as === "name" && best.score > 0;
};

/**
 * Whether a word said in a message stands as a name there, at any place it is said: its
 * neighbours (none past a sentence's or clause's edge) and how it was written.
 */
export function standsAsNameIn(message: string, word: string): boolean {
  const w = word.toLowerCase();
  const sentences = message.split(/(?<=[.!?;:])\s+/);
  for (const sentence of sentences) {
    const t = sentence.match(/[A-Za-z]+(?:['’][a-z]+)?|\$?\d[\d,.]*|[,()]/g) ?? [];
    for (let i = 0; i < t.length; i++) {
      const x = t[i]!.replace(/['’]s$/, "");
      if (x.toLowerCase() !== w) continue;
      const edge = (y: string | undefined) => (y === undefined || /^[,()]$/.test(y) ? "" : y.replace(/['’]s$/, ""));
      const capitalised = i > 0 && /^[A-Z][a-z]/.test(x);
      const best = slotReadings(x, edge(t[i - 1]), edge(t[i + 1]), { capitalised })[0];
      const name = (k: number) => {
        const y = edge(t[k]);
        if (!y || /\d/.test(y)) return 0;
        const r = slotReadings(y, edge(t[k - 1]), edge(t[k + 1]), { capitalised: k > 0 && /^[A-Z][a-z]/.test(y) });
        const n = r.find((z) => z.as === "name")?.score ?? 0;
        return r[0]?.as === "name" ? Math.max(0, n) : 0;
      };
      // Joined to another by "and" or "or", it is the same kind of thing: beside a name, a name.
      const joined = [i - 1, i + 1].filter((k) => tagsOf((t[k] ?? "").toLowerCase()).includes("Conjunction")).map((k) => name(k + (k < i ? -1 : 1)));
      const own = slotReadings(x, edge(t[i - 1]), edge(t[i + 1]), { capitalised }).find((r) => r.as === "name")?.score ?? -Infinity;
      const boosted = own + 0.5 * Math.max(0, ...joined);
      const rival = slotReadings(x, edge(t[i - 1]), edge(t[i + 1]), { capitalised }).find((r) => r.as === "word")?.score ?? 0;
      if (best && boosted > 0 && boosted > Math.max(0, rival)) return true;
    }
  }
  return false;
}
