/**
 * A message that tells a situation and asks about it ("Janet's ducks lay 16 eggs per day. She eats
 * three for breakfast ... How much in dollars does she make every day?"), read as one situation:
 * every amount it states, as a value with a unit ("16 eggs per day" is 16 egg/day, "$2 per egg" 2
 * dollar/egg, "twice as many" a ratio of 2, "60%" a share), and what is asked, as the unit its
 * answer comes in ("how much in dollars ... every day" is dollar/day).
 *
 * The answer is found the way units are worked with, not by a rule for each kind of problem:
 * amounts are combined (added and taken away where the units agree, multiplied and divided where
 * they make a new one) until the units come out as the unit asked, using every amount stated once
 * if that can be done. Which of the combinations is meant is weighed by what the words say each
 * amount does: what a doing takes away (eat, sell, spend: `Removes()` on its Concept, packs/
 * quantities.ncon) is taken away, what one adds is added; what a question asks of what is left
 * ("left", "remain") or all together ("total") counts too. Each step is said, so the working can
 * be checked.
 */
import { call, isCall, type Expr } from "../concept/expression.js";
import { ConceptStore } from "../store/store.js";
import { lexicon, type Lexicon } from "./lexicon.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words as hostWords } from "../runtime/host.js";
import { chain } from "../frame/senses.js";

/** A unit as its base units and their powers: dollar per egg is { dollar: 1, egg: -1 }. */
export type Unit = Readonly<Record<string, number>>;

export interface Amount {
  readonly value: number;
  readonly unit: Unit;
  /** As it was written, for saying the working. */
  readonly said: string;
  readonly sentence: number;
  /** A ratio or a share ("twice", "60%"): only ever multiplies. */
  readonly ratio?: boolean;
  /** +1 when what the sentence's doing does adds it, -1 when it takes it away, 0 when nothing says. */
  readonly sign: number;
  /** Who or what holds it: the sentence's subject ("Toulouse", "she" as the last one named). */
  readonly holder?: string;
  /**
   * A ratio's referent: what it is a ratio of. "as many as Charleston" is Charleston's; "that
   * much", "of the price", "by 30%" the amount said last. `change`: +1 for "increased by", -1 for
   * "reduced by", so the result is (1 ± ratio) of the referent.
   */
  readonly of?: { readonly holder?: string; readonly last?: boolean; readonly unit?: string; readonly change?: number; readonly differs?: number; readonly left?: boolean; readonly thing?: boolean; readonly named?: string; readonly next?: boolean };
  /** Which of its kind it is: "30 more gold coins" gold, "they won 8 more" win. */
  readonly kind?: string;
  /** What can be had at most ("can carry no more than 5000 pounds"): the others are taken from it. */
  readonly capacity?: boolean;
  /** Said to be all of them together ("27 meals and packages combined"): a whole, never one part. */
  readonly whole?: boolean;
  /** Said in the question ("after 10 years"): used when it helps, not owed. */
  readonly optional?: boolean;
  /** What another amount was worked out from ("Ben's", once Alan's is twice it): already counted in it. */
  readonly consumed?: boolean;
  /** Worked out from a ratio or comparison and what it is of. */
  readonly derived?: boolean;
  /** The doing of its clause, as its base ("ate" eat): what the steps it is in are weighed by. */
  readonly doing?: string;
}

export interface Asked {
  readonly unit: Unit;
  /** "left", "remain": what is left after some are taken away. "total": all of them together. */
  readonly left: boolean;
  readonly total: boolean;
  /** "how many more ... than", "compared to": the difference between two amounts. */
  readonly more: boolean;
  /** The one asked about, when the question names one ("how old will Mel be"). */
  readonly holder?: string;
  /** The kind asked about ("how many gold coins", "how many did they win"). */
  readonly kind?: string;
  readonly said: string;
}

/** The words of the situation being read: what each does, from the graph (situation/lexicon.ts). */
let lex: Lexicon = lexicon(new ConceptStore());
const comparesUp = (w: string) => lex.compares(w) > 0;
const comparesDown = (w: string) => lex.compares(w) < 0;
const partOf = (w: string): number | undefined => lex.parts(w);
const MONEY = "dollar";
/** A name as said of what it has: "Harald's" is Harald. */
const plain = (name: string): string => name.replace(/['’]s$/, "");
/** A unit of time: what the graph says it measures. */
const TIME = { test: (u: string) => lex.measures(u) === "Time" };
const base = (word: string): string => {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return w;
  // A written form of a unit is that unit ("feet" foot, "bucks" dollar); other synonyms are not units.
  const unit = (x: string) => {
    const to = lex.synonym(x);
    return to && lex.measures(to) ? to : undefined;
  };
  const l = unit(w) ?? lemma(w);
  return lex.per(w) ?? lex.per(l) ?? unit(l) ?? l;
};

const unitOf = (top: string | undefined, bottom: string | undefined): Unit => {
  const u: Record<string, number> = {};
  if (top) u[top] = (u[top] ?? 0) + 1;
  if (bottom) u[bottom] = (u[bottom] ?? 0) - 1;
  return Object.fromEntries(Object.entries(u).filter(([, v]) => v !== 0));
};

export const sameUnit = (a: Unit, b: Unit): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
};
export const times = (a: Unit, b: Unit, sign = 1): Unit => {
  const u: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) u[k] = (u[k] ?? 0) + sign * v;
  return Object.fromEntries(Object.entries(u).filter(([, v]) => v !== 0));
};
export const sayUnit = (u: Unit): string => {
  const top = Object.entries(u).filter(([, v]) => v > 0).map(([k, v]) => (v > 1 ? `${k}^${v}` : k));
  const bottom = Object.entries(u).filter(([, v]) => v < 0).map(([k, v]) => (v < -1 ? `${k}^${-v}` : k));
  return `${top.join("·") || "1"}${bottom.length ? "/" + bottom.join("·") : ""}`;
};

interface Token {
  readonly text: string;
  readonly lower: string;
  readonly tags: readonly string[];
  readonly number?: number;
  readonly money?: boolean;
  readonly percent?: boolean;
  /** A share said in words ("a third", "two-fifths"): its number is the fraction. */
  readonly share?: boolean;
  /** A comma was written just before it. */
  readonly comma?: boolean;
}

/** A sentence's words, with numbers read ("$80,000", "60%", "three", "1.5"). */
function tokenize(sentence: string): Token[] {
  const tagged = hostWords(sentence);
  // Each word's tags where it stands: the same word can be a noun here and a verb there.
  let at = 0;
  const tagsOf = (lower: string): readonly string[] => {
    for (let k = at; k < tagged.length; k++) {
      if (tagged[k]!.text.toLowerCase().replace(/[^a-z0-9'-]/g, "") === lower) {
        at = k + 1;
        return tagged[k]!.tags;
      }
    }
    return tagged.find((w) => w.text.toLowerCase() === lower)?.tags ?? [];
  };
  const out: Token[] = [];
  const pattern = /\$?(?:\d[\d,]*)?\.?\d+(?:\/\d+)?%?|[A-Za-z]+(?:[-'’][A-Za-z]+)*|[/]/g;
  let was = 0;
  for (let m = pattern.exec(sentence); m; m = pattern.exec(sentence)) {
    const raw = m[0];
    const comma = sentence.slice(was, m.index).includes(",");
    was = m.index + raw.length;
    const lower = raw.toLowerCase();
    // "2/5": a share written as a fraction.
    const fraction = /^(\d+)\/(\d+)$/.exec(raw);
    if (fraction && Number(fraction[2]) > 0) {
      out.push({ text: raw, lower, tags: ["Value"], number: Number(fraction[1]) / Number(fraction[2]), share: true, ...(comma ? { comma } : {}) });
      continue;
    }
    const digits = /^\$?((?:\d[\d,]*)?\.?\d+)(%?)$/.exec(raw);
    if (digits) {
      out.push({ text: raw, lower, tags: ["Value"], number: Number(digits[1]!.replace(/,/g, "")), money: raw.startsWith("$"), percent: digits[2] === "%", ...(comma ? { comma } : {}) });
      continue;
    }
    const t = tagsOf(lower);
    const n = lex.count(lower);
    out.push({ text: raw, lower, tags: t, ...(n !== undefined ? { number: n } : {}), ...(comma ? { comma } : {}) });
  }
  // A share in words: "a third", "two thirds", "one-fifth", "three fourths". Only less than a whole:
  // "20 quarters" are coins.
  const shared: Token[] = [];
  for (let k = 0; k < out.length; k++) {
    const tk = out[k]!;
    const hyphen = /^([a-z]+)-([a-z]+)$/.exec(tk.lower);
    const top = hyphen ? (hyphen[1] === "a" || hyphen[1] === "an" ? 1 : lex.count(hyphen[1]!)) : tk.lower === "a" || tk.lower === "an" ? 1 : tk.number;
    const bottom = hyphen ? partOf(hyphen[2]!) : out[k + 1] ? partOf(out[k + 1]!.lower) : undefined;
    if (top !== undefined && bottom !== undefined && top < bottom && !(bottom === 2 && !hyphen && tk.lower !== "one")) {
      shared.push({ text: hyphen ? tk.text : `${tk.text} ${out[k + 1]!.text}`, lower: tk.lower, tags: ["Value"], number: top / bottom, share: true });
      if (!hyphen) k++;
      continue;
    }
    shared.push(tk);
  }
  // "percent" after a number makes it a share.
  return shared.map((tk, i) => (tk.number !== undefined && (out[i + 1]?.lower === "percent" || out[i + 1]?.lower === "%") ? { ...tk, percent: true } : tk));
}

const isNoun = (t: Token | undefined) => !!t && t.number === undefined && (t.tags.includes("Noun") || t.tags.includes("Plural") || t.tags.includes("Singular")) && !t.tags.includes("Pronoun") && !t.tags.includes("Possessive");
const isSkippable = (t: Token | undefined) => !!t && t.number === undefined && (t.tags.includes("Adjective") || t.tags.includes("Determiner") || t.tags.includes("Possessive") || t.tags.includes("Comparative") || t.lower === "more" || t.lower === "of" || t.lower === "extra" || t.lower === "other");

/** Counted, a word in -s is a thing even where the tagger takes it for a doing ("six more digits"). */
const counted = (t: Token | undefined) => !!t && t.number === undefined && !/^(does|has|was|is|goes|says|gets|makes|takes)$/.test(t.lower) && t.tags.includes("Verb") && /[^s]s$/.test(t.lower) && t.lower.length > 3 && !t.tags.includes("Copula");

/** The noun an amount is of: the next noun, past what describes it ("2 bolts of blue fiber": bolt). */
function headAfter(tokens: readonly Token[], at: number): { unit?: string; end: number } {
  let i = at;
  while (i < tokens.length && i - at < 4 && isSkippable(tokens[i]) && !isNoun(tokens[i])) i++;
  if (!isNoun(tokens[i]) && counted(tokens[i]) && (i === at || tokens.slice(at, i).every((x) => isSkippable(x)))) return { unit: base(tokens[i]!.text), end: i + 1 };
  if (!isNoun(tokens[i])) return { end: at };
  // A compound ("duck egg", "chicken feed") is named by its last noun.
  let j = i;
  // A plural does not describe the word after it ("8 pencils cost", "his friends receive").
  while (!tokens[j]!.tags.includes("Plural") && (isNoun(tokens[j + 1]) || (counted(tokens[j + 1]) && tokens[j + 2]?.number === undefined)) && !tokens[j + 1]!.tags.includes("Adjective") && tokens[j + 1]!.lower !== "old" && j - i < 2) j++;
  return { unit: base(tokens[j]!.text), end: j + 1 };
}

/** What tells a noun phrase from others of its head: "gold coins" gold, "the original price" original. */
function describer(tokens: readonly Token[], from: number, to: number): string | undefined {
  const h = headAfter(tokens, from);
  if (!h.unit) return undefined;
  const words = tokens.slice(from, h.end - 1).filter((t) => !/^(more|less|fewer|than|of|the|a|an|as|many|much|times|extra|other)$/.test(t.lower) && t.number === undefined && !t.tags.includes("Determiner") && !t.tags.includes("Possessive"));
  const w = words[words.length - 1];
  return w && h.end - 1 <= to ? lemma(w.lower) : undefined;
}

/** "per day", "a week", "each sprint", "every morning", "/minute": what an amount is counted per. */
function perAfter(tokens: readonly Token[], at: number): { per?: string; end: number } {
  // Past what it is made of ("30 sheets of paper on a pad").
  if (tokens[at]?.lower === "of" && isNoun(tokens[at + 1]) && /^(on|in|inside|per|each|every|a|an|for)$/.test(tokens[at + 2]?.lower ?? "")) {
    const past = perAfter(tokens, at + 2);
    if (past.per) return past;
  }
  // What it takes to do one: "3 minutes to dig a small hole", "$5 to make each shirt".
  if (tokens[at]?.lower === "to" && tokens[at + 1]?.tags.includes("Verb") && /^(a|an|one|each|every)$/.test(tokens[at + 2]?.lower ?? "")) {
    const h = headAfter(tokens, at + 3);
    if (h.unit && !TIME.test(h.unit)) return { per: h.unit, end: h.end };
  }
  // In what holds it: "30 sheets on a pad", "12 eggs in a carton", "4 wheels on each car".
  if (/^(on|in|inside)$/.test(tokens[at]?.lower ?? "") && /^(a|an|one|each|every)$/.test(tokens[at + 1]?.lower ?? "")) {
    const h = headAfter(tokens, at + 2);
    if (h.unit && !TIME.test(h.unit)) return { per: h.unit, end: h.end };
  }
  if (/^(on|in|at|for)$/.test(tokens[at]?.lower ?? "") && /^(each|every|per)$/.test(tokens[at + 1]?.lower ?? "")) {
    const h = headAfter(tokens, at + 2);
    if (h.unit) return { per: h.unit, end: h.end };
  }
  const t = tokens[at];
  if (!t) return { end: at };
  if (t.lower === "per" || t.lower === "a" || t.lower === "an" || t.lower === "each" || t.lower === "every" || t.text === "/") {
    const h = headAfter(tokens, at + 1);
    if (h.unit && (t.lower !== "a" && t.lower !== "an" ? true : /^(day|week|month|year|hour|minute|second|time)$/.test(h.unit))) return { per: h.unit, end: h.end };
  }
  if (lex.per(t.lower)) return { per: lex.per(t.lower), end: at + 1 };
  return { end: at };
}

/** What a doing does to what it is done with: `Removes()` or `Adds()` on its Concept. */
function effect(_store: ConceptStore, verb: string): number {
  return lex.effect(verb);
}

/** Who a sentence is about: its first name, or the noun before its doing; "she" is the last one. */
interface Last {
  unit?: string;
  holder?: string;
  /** Something is priced or counted by the dozen ("$68 per dozen"): "3 dozen" is then 3 of a dozen. */
  dozens?: boolean;
  /** "3 groups of 200 employees": the next amount is per group. */
  groupOf?: string;
}

function holderOf(tokens: readonly Token[], last: { holder?: string }): string | undefined {
  const v = tokens.findIndex((t) => t.tags.includes("Verb") && t.number === undefined);
  const before = tokens.slice(0, v < 0 ? tokens.length : v);
  const named = before.find((t, i) => /^[A-Z]/.test(t.text) && (i > 0 || t.tags.includes("ProperNoun") || !t.tags.includes("Pronoun")) && !t.tags.includes("Pronoun") && !t.tags.includes("Determiner") && t.number === undefined && !/^(The|A|An|In|On|At|If|Every|Each|This|That|Then|After|Before|For|When|Normally|Also|There|These|Those|It|They|He|She|We|You|I)$/.test(t.text));
  if (named) return named.text;
  if (before.some((t) => t.tags.includes("Pronoun"))) return last.holder;
  const noun = [...before].reverse().find((t) => isNoun(t));
  return noun ? base(noun.text) : last.holder;
}

/** Every amount a sentence states. */
function amountsIn(store: ConceptStore, sentence: string, index: number, last: Last, optional = false): Amount[] {
  const tokens = tokenize(sentence);
  // Who was talked of before this sentence: what "he" in "than he has" points at.
  const before = last.holder;
  let holder = holderOf(tokens, last);
  if (holder) last.holder = holder;
  const out: Amount[] = [];
  let verb = 0;
  let doing: string | undefined;
  // The doing of the clause so far, whatever it does ("has", "buys", "costs").
  let said: string | undefined;
  // How many amounts were read before each word: what a clause says is out[countAt[from] .. countAt[to]).
  const countAt: number[] = [];
  // After "5 more than", the ratio said next is a step in that amount, no one's own.
  let inner = false;
  // A clause that names someone else doing ("..., and Harry has half as many") is theirs.
  const names = (k: number) => k > 0 && /^[A-Z]/.test(tokens[k]!.text) && tokens[k]!.number === undefined && !tokens[k]!.tags.includes("Pronoun") && (tokens[k]!.comma || (/^(and|but|while|whereas)$/.test(tokens[k - 1]!.lower) && !(k > 1 && /^[A-Z]/.test(tokens[k - 2]!.text) && tokens[k - 2]!.number === undefined && !tokens[k - 1]!.comma && (k === 2 || tokens[k - 2]!.comma)))) && !!tokens[k + 1]?.tags.includes("Verb");
  // What a ratio is of: "as many sheep as Charleston" (a holder), "that much", "of the price",
  // "by 30%" (the amount said last; increased or reduced by it).
  const ratioOf = (at: number): Amount["of"] => {
    const rest = tokens.slice(at, at + 8);
    // "4 times what Grace weighs", "half of Raymond's jewels": theirs.
    const theirs = rest.slice(0, 4).find((t, k) => /^[A-Z]/.test(t.text) && !t.tags.includes("Pronoun") && (/['’]s$/.test(t.text) || rest[k - 1]?.lower === "what"));
    if (theirs && !rest.slice(0, rest.indexOf(theirs)).some((t) => t.lower === "as")) return { holder: theirs.text };
    // "as many sheep as Charleston", "two times older than Suzy's": what it is a ratio of follows.
    const as = rest.findIndex((t, k) => k > 0 && ((t.lower === "as" && (rest[0]?.lower === "as" || rest.slice(0, k).some((x) => x.lower === "many" || x.lower === "much" || isNoun(x)))) || (t.lower === "than" && rest.slice(0, k).some((x) => comparesUp(x.lower)))));
    if (as >= 0) {
      const who = rest.slice(as + 1).find((t) => /^[A-Z]/.test(t.text) || t.tags.includes("Pronoun") || isNoun(t));
      const counted = rest.slice(0, as).find((t) => isNoun(t));
      // A name is a holder ("as Charleston"); a common noun is the amount of it said last ("as the
      // downloads in the first month").
      const common = !!who && isNoun(who) && !/^[A-Z]/.test(who.text);
      // "as meals": a kind of its own, counted only if some amount is of it.
      const named = common && !rest.slice(as + 1).some((t) => t.lower === "the") ? base(who!.text) : undefined;
      if (who) return { ...(/^[A-Z]/.test(who.text) && !who.tags.includes("Pronoun") ? { holder: who.text } : { last: true }), ...(counted ? { unit: base(counted.text) } : common ? { unit: base(who.text) } : {}), ...(named ? { named } : {}) };
    }
 // "a 25% discount from the original price": the original, whatever it was.
    const from = rest.findIndex((t) => t.lower === "from");
    if (from >= 0 && lex.marks(rest[from + 2]?.lower ?? rest[from + 1]?.lower ?? "", "Before")) return { last: true, named: (rest[from + 2] ?? rest[from + 1])!.lower };
    const of = rest.findIndex((t) => t.lower === "of" || t.lower === "that" || t.lower === "it" || t.lower === "this");
    // "of it", "of the sandwiches": the thing itself, as said, not a share already taken of it.
    const thing = of >= 0 && (rest[of]!.lower === "it" || rest[of + 1]?.lower === "it" || (rest[of]!.lower === "of" && rest[of + 1]?.lower === "the" && isNoun(rest[of + 2]) && !/^(rest|remaining|remainder)$/.test(rest[of + 2]!.lower)));
    // "of what is left", "of the rest", "the remaining money": what is had by then.
    if (of >= 0 && rest.slice(of + 1, of + 5).some((t) => lex.marks(t.lower, "Remaining"))) return { last: true, left: true };
    // "a third of what Laurie did": Laurie's.
    const whose = of >= 0 && rest[of + 1]?.lower === "what" ? rest[of + 2] : undefined;
    if (whose && /^[A-Z]/.test(whose.text) && !whose.tags.includes("Pronoun")) return { holder: whose.text };
    const priced = rest.slice(of + 1).find((t) => isNoun(t));
    const money = priced && lex.marks(base(priced.text), "Money");
    return { last: true, ...(money ? { unit: MONEY } : {}), ...(thing ? { thing } : {}) };
  };
  for (let i = 0; i < tokens.length; i++) {
    countAt[i] = out.length;
    let t = tokens[i]!;
    if (names(i)) {
      holder = t.text;
      last.holder = holder;
      verb = 0;
      said = undefined;
    }
    if (t.tags.includes("Verb") && t.number === undefined && !t.tags.includes("Auxiliary")) said = lemma(t.lower);
    if (t.tags.includes("Verb") && t.number === undefined) {
      const e = effect(store, t.text);
      if (e !== 0 || lex.effectOnMoney(t.text) !== undefined) {
        verb = e;
        doing = t.text;
      }
    }
    // A ratio: "twice as many", "half that much", "3 times as many", "1.2 times her rate".
    const ratioWord = lex.times(t.lower);
    if (ratioWord !== undefined && t.number === undefined) {
      const wasInner = inner;
      inner = false;
      if (wasInner) {
        out.push({ value: ratioWord, unit: {}, said: t.text, sentence: index, ratio: true, sign: verb, ...(said ? { doing: said } : {}), of: ratioOf(i + 1) });
        continue;
      }
      out.push({ value: ratioWord, unit: {}, said: t.text, sentence: index, ratio: true, sign: verb, ...(said ? { doing: said } : {}), ...(holder && !inner ? { holder } : {}), of: ratioOf(i + 1) });
      continue;
    }
    if (t.number === undefined) continue;
    // "every 3 miles": what the amount before it is counted per, three of them at a time.
    if (/^(every|per|each)$/.test(tokens[i - 1]?.lower ?? "") && out.length && !t.money && !t.percent) {
      const h = headAfter(tokens, i + 1);
      const prev = out[out.length - 1]!;
      if (h.unit && !prev.ratio && !Object.values(prev.unit).some((v) => v < 0)) {
        out[out.length - 1] = { ...prev, value: prev.value / t.number, unit: times(prev.unit, { [h.unit]: -1 }), said: `${prev.said} every ${t.text} ${tokens.slice(i + 1, h.end).map((x) => x.text).join(" ")}` };
        i = h.end - 1;
        continue;
      }
    }
    const next = tokens[i + 1];
    if (next && next.lower === "times" && tokens[i + 2] && (/^(as|more|the|her|his|their|its|that|what)$/.test(tokens[i + 2]!.lower) || comparesUp(tokens[i + 2]!.lower))) {
      out.push({ value: t.number, unit: {}, said: `${t.text} times`, sentence: index, ratio: true, sign: verb, ...(said ? { doing: said } : {}), ...(holder && !inner ? { holder } : {}), of: ratioOf(i + 2) });
      i += 1;
      continue;
    }
    if (t.percent) {
      // "by 30%" after a doing that adds or takes away: (1 ± 30%) of what was said last.
      const by = tokens[i - 1]?.lower === "by";
      // "45% discount", "50% more expensive", "20% off": which way the words after it say.
      const way = tokens.slice(i + 1, i + 4).map((x) => x.lower);
      const said = way.some((w) => lex.changes(w) < 0) ? -1 : way.some((w) => lex.changes(w) > 0) ? 1 : undefined;
      const change = said ?? (by ? (verb !== 0 ? verb : /increase|rais|grow|gain|rose|up/.test(tokens.slice(0, i).map((x) => x.lower).join(" ")) ? 1 : -1) : undefined);
      out.push({ value: t.number / 100, unit: {}, said: t.text + (t.text.endsWith("%") ? "" : "%"), sentence: index, ratio: true, sign: 0, ...(holder ? { holder } : {}), of: { ...ratioOf(i + 1), ...(change !== undefined ? { change } : {}) } });
      continue;
    }
    // "a third", "two-fifths": a share of what it is said of.
    if (t.share) {
      out.push({ value: t.number, unit: {}, said: t.text, sentence: index, ratio: true, sign: verb, ...(said ? { doing: said } : {}), ...(holder && !inner ? { holder } : {}), of: ratioOf(i + 1) });
      continue;
    }
    let unit: string | undefined;
    let end = i + 1;
    if (t.money) unit = MONEY;
    else if (next && next.lower === "times") {
      unit = undefined;
      end = i + 2;
    } else {
      // "3 dozen donuts": counted in dozens.
      if (next && /^dozens?$/.test(next.lower)) {
        const of = headAfter(tokens, i + 2);
        end = of.unit ? of.end : i + 2;
        // Counted in dozens where something is priced by the dozen; else a dozen is twelve.
        if (last.dozens || !of.unit) unit = "dozen";
        else {
          unit = of.unit;
          t = { ...t, number: t.number * 12, text: `${t.text} dozen` };
        }
      } else {
        const h = headAfter(tokens, i + 1);
        if (h.unit) {
          unit = h.unit;
          end = h.end;
        }
      }
    }
    // Said without a unit ("eats three for breakfast"): of the last thing counted.
    if (!unit && !(next && next.lower === "times")) unit = last.unit;
    if (unit && unit !== MONEY && !TIME.test(unit)) last.unit = unit;
    const priced = t.money && /^(a|an)$/.test(tokens[end]?.lower ?? "") && headAfter(tokens, end + 1).unit;
    // "3 groups of 200 employees": what follows is per one of them; read as its own amount next.
    const groupOf = !t.money && unit && tokens[end]?.lower === "of" && tokens[end + 1]?.number !== undefined;
    if (groupOf) last.groupOf = unit;
    const per = priced
      ? { per: priced, end: headAfter(tokens, end + 1).end }
      : t.money && isNoun(tokens[end]) && /^(per|each|every|a|an)$/.test(tokens[end + 1]?.lower ?? "") && headAfter(tokens, end + 2).unit
        ? { per: headAfter(tokens, end + 2).unit!, end: headAfter(tokens, end + 2).end }
        : perAfter(tokens, end);
    // "40 more goats than Washington", "three years younger than Katherine": an amount more or less
    // than another one's, which is what it is of.
    const near = tokens.slice(i + 1, Math.max(per.end, end) + 2);
    const way = near.find((x) => comparesUp(x.lower) || comparesDown(x.lower));
    const than = way ? tokens.findIndex((x, k) => k > i && k <= Math.max(per.end, end) + 3 && x.lower === "than") : -1;
    if (way && than >= 0) {
      const who = tokens.slice(than + 1, than + 4).find((x) => (/^[A-Z]/.test(x.text) && !x.tags.includes("Pronoun")) || isNoun(x));
      // Told apart by a describing word ("than silver coins") or a doing ("than they lost").
      // "than he has", "than she is": the one before, restated, not a kind of its own.
      const restated = tokens[than + 1]?.tags.includes("Pronoun") && /^(has|have|had|is|was|are|were|does|did|do)$/.test(tokens[than + 2]?.lower ?? "");
      const afterPronoun = !restated && tokens[than + 1]?.tags.includes("Pronoun") && tokens[than + 2]?.tags.includes("Verb") ? lemma(tokens[than + 2]!.lower) : undefined;
      const named = afterPronoun ?? (who && !/^[A-Z]/.test(who.text) ? describer(tokens, than + 1, than + 5) : undefined);
      const doing = [...tokens.slice(0, i)].reverse().find((x) => x.tags.includes("Verb") && x.number === undefined && !/^(is|are|was|were|be|has|have|had)$/.test(x.lower));
      const kind = describer(tokens, i + 1, than) ?? (afterPronoun && doing ? lemma(doing.lower) : undefined);
      // "5 more than half of Raymond's", "2 less than 4 times what Grace weighs": than the ratio said next.
      const after = tokens[than + 1];
      const nested = !!after && (lex.times(after.lower) !== undefined || after.share === true || (after.number !== undefined && tokens[than + 2]?.lower === "times"));
      out.push({
        value: t.number!,
        unit: unitOf(unit, per.per),
        said: tokens.slice(i, than + 2).map((x) => x.text).join(" "),
        sentence: index,
        ratio: true,
        sign: verb,
        ...(holder ? { holder } : {}),
        of: nested
          ? { next: true, differs: comparesUp(way.lower) ? 1 : -1 }
          : { ...(who && /^[A-Z]/.test(who.text) ? { holder: who.text } : restated && before ? { holder: before } : { last: true }), differs: comparesUp(way.lower) ? 1 : -1, ...(unit && unit !== "year" ? { unit } : {}), ...(named ? { named } : {}) },
        ...(kind ? { kind } : {}),
      });
      i = Math.max(i, than);
      inner = nested;
      continue;
    }
    // "2 pairs of shoes for each of his 3 children": what was said before is per one of these.
    const eachOf = tokens.slice(Math.max(0, i - 4), i).findIndex((x, k, arr) => x.lower === "each" && arr[k + 1]?.lower === "of");
    if (eachOf >= 0 && unit && out.length && last.unit === unit) {
      // The thing counted is still what was before ("they cost $60 each" is per pair, not per child).
      const before = Object.keys(out[out.length - 1]!.unit).find((k) => (out[out.length - 1]!.unit[k] ?? 0) > 0);
      if (before) last.unit = before;
    }
    if (eachOf >= 0 && unit && out.length) {
      const prev = out[out.length - 1]!;
      if (!prev.ratio && !Object.values(prev.unit).some((v) => v < 0)) out[out.length - 1] = { ...prev, unit: times(prev.unit, { [unit]: -1 }) };
    }
    // "$60 each", "15 pounds each", "boxes, each weighing 15 pounds": per one of the things counted.
    const eachAfter = tokens[Math.max(per.end, end)]?.lower === "each" && !tokens[Math.max(per.end, end) + 1]?.tags.includes("Noun");
    const eachBefore = tokens.slice(Math.max(0, i - 3), i).findIndex((x) => x.lower === "each");
    const eachNoun = eachBefore >= 0 ? [...tokens.slice(0, i - 3 + eachBefore)].reverse().find((x) => isNoun(x) || counted(x)) : undefined;
    const perEach = per.per ? undefined : eachAfter ? (last.unit !== unit ? last.unit : undefined) : eachNoun && eachBefore >= 0 && tokens[i - 3 + eachBefore + 1]?.lower !== "of" ? base(eachNoun.text) : undefined;
    // "can carry no more than 5000 pounds", "a budget of $50": what the rest is taken from.
    const capacity = /(no more than|up to|at most|maximum of|limit of|capacity of|can (carry|hold|fit)|budget of)$/.test(tokens.slice(Math.max(0, i - 5), i).map((x) => x.lower).join(" "));
    // "3 minutes to dig a small hole": of the small ones, as said of what it is per.
    const beforePer = per.per ? tokens[per.end - 2] : undefined;
    const perKind = beforePer && beforePer.number === undefined && !beforePer.tags.includes("Determiner") && !/^(a|an|each|every|per|one|of|to|on|in|for)$/.test(beforePer.lower) && (beforePer.tags.includes("Adjective") || isNoun(beforePer)) ? lemma(beforePer.lower) : undefined;
    // "if 5 did not grow": not done, so taken away.
    const not = tokens.slice(i + 1, i + 5).some((x) => /^(not|never|didn't|don't|doesn't|won't|can't|couldn't|wasn't|weren't)$/.test(x.lower) || x.lower.endsWith("n't"));
    const inGroup = tokens[i - 1]?.lower === "of" && last.groupOf ? last.groupOf : undefined;
    if (inGroup) last.groupOf = undefined;
    // "In June, his expenditure was $60 less", "she slept 2 hours less": more or less than what was
    // said before it.
    const after = tokens[Math.max(per.end, end)];
    if (after && (comparesUp(after.lower) || comparesDown(after.lower)) && after.lower !== "extra" && after.lower !== "additional" && !tokens.slice(Math.max(per.end, end), Math.max(per.end, end) + 4).some((x) => x.lower === "than")) {
      out.push({ value: t.number!, unit: unitOf(unit, per.per), said: tokens.slice(i, Math.max(per.end, end) + 1).map((x) => x.text).join(" "), sentence: index, ratio: true, sign: verb, ...(said ? { doing: said } : {}), ...(holder ? { holder } : {}), of: { last: true, differs: comparesUp(after.lower) ? 1 : -1, ...(unit ? { unit } : {}) } });
      i = Math.max(per.end, end);
      continue;
    }
    out.push({
      value: t.number!,
      unit: unitOf(unit, per.per ?? (perEach && perEach !== unit ? perEach : undefined) ?? (inGroup && inGroup !== unit ? inGroup : undefined)),
      said: tokens.slice(i, Math.max(per.end, end) + (eachAfter ? 1 : 0)).map((x) => x.text).join(" "),
      sentence: index,
      // A doing can do one thing to what is done and another to money: selling takes away what is
      // sold and brings money in.
      sign: not ? -1 : unit === MONEY && doing !== undefined ? (lex.effectOnMoney(doing) ?? verb) : verb,
      ...(said ? { doing: said } : {}),
      ...(capacity ? { capacity } : {}),
      ...(holder ? { holder } : {}),
      ...(optional ? { optional } : {}),
      ...(describer(tokens, i + 1, end) ? { kind: describer(tokens, i + 1, end)! } : perKind ? { kind: perKind } : {}),
      ...(/\b(combined|in total|altogether|all together|together|in all|total of|between (them|the two|the three)|among (them|the))\b/i.test(sentence) ? { whole: true } : {}),
    });
    i = Math.max(i, Math.max(per.end, end) - 1);
  }
  // "Each rose bush has 25 roses", "Every ticket costs $5": what is said of each one is per one.
  // "Each rose bush has 25 roses", "An eraser costs $2 and a pencil costs $3", "A glass of milk is 8
  // ounces": what each one, or one of them, has, is or costs is per one, in its own clause.
  for (let k = tokens.length; k >= 0; k--) countAt[k] ??= out.length;
  const starts = tokens.flatMap((tk, k) => {
    if (!/^(a|an|one|each|every)$/.test(tk.lower) || !(k === 0 || tk.comma || /^(and|but|while|if|so|then)$/.test(tokens[k - 1]!.lower) || (k < 3 && /^(each|every)$/.test(tk.lower)))) return [];
    const h = headAfter(tokens, k + 1);
    const first = tokens.findIndex((x, n) => n >= h.end && x.number !== undefined);
    if (!h.unit || TIME.test(h.unit) || first < 0) return [];
    const between = tokens.slice(h.end, first);
    const one = /^(each|every)$/.test(tk.lower)
      ? between.length > 0
      : between.some((x) => /^(costs?|is|are|was|weighs?|has|have|holds?|contains?|takes?|needs?|sells?|pays?|earns?|makes?|gives?|produces?|lays?)$/.test(x.lower));
    return one ? [{ at: k, unit: h.unit, end: h.end }] : [];
  });
  const per = out.slice();
  // A clause ends where another begins: "and" or a comma, then someone or a doing.
  const clauseEnd = (from: number) => {
    const k = tokens.findIndex((x, n) => n > from && (/^(and|but|so)$/.test(x.lower) || x.comma) && (tokens[n + (x.comma && !/^(and|but|so)$/.test(x.lower) ? 0 : 1)]?.tags.some((g) => g === "Pronoun" || g === "Verb") ?? false));
    return k < 0 ? tokens.length : k;
  };
  starts.forEach((st, n) => {
    const to = countAt[Math.min(starts[n + 1]?.at ?? tokens.length, clauseEnd(st.end))] ?? out.length;
    for (let a = countAt[st.end] ?? out.length; a < to; a++) {
      const x = per[a]!;
      if (x.ratio || Object.values(x.unit).some((v) => v < 0) || x.unit[st.unit]) continue;
      per[a] = { ...x, unit: times(x.unit, { [st.unit]: -1 }) };
    }
  });
  if (starts.length) return per;
  // A period said after the amounts ("... with four every day"): what the sentence counts per.
  const tail = tokens.findIndex((tk, k) => (tk.lower === "every" || tk.lower === "each" || tk.lower === "per" || lex.per(tk.lower) !== undefined || ((tk.lower === "a" || tk.lower === "an") && TIME.test(headAfter(tokens, k + 1).unit ?? ""))) && k > 0);
  if (tail >= 0) {
    const p = perAfter(tokens, tail);
    if (p.per && /^(day|week|month|year|hour|minute)$/.test(p.per)) {
      return out.map((a) => (a.ratio || Object.values(a.unit).some((v) => v < 0) || a.unit[p.per!] !== undefined ? a : { ...a, unit: times(a.unit, { [p.per!]: -1 }) }));
    }
  }
  return out;
}

/** What the question asks for: "how much in dollars ... every day" is dollar/day. */
function askedIn(question: string, amounts: readonly Amount[], whole = question): Asked | undefined {
  const tokens = tokenize(question);
  const lower = question.toLowerCase();
  const all = whole.toLowerCase();
  if (!/\bhow (much|many|long|far|old)\b|\bwhat (is|was|will|are)\b/.test(lower)) return undefined;
  let top: string | undefined;
  const many = tokens.findIndex((t, i) => (t.lower === "many" || t.lower === "much") && tokens[i - 1]?.lower === "how");
  if (many >= 0) {
    const h = headAfter(tokens, many + 1);
    if (h.unit && h.unit !== "time") top = h.unit;
  }
  // "the number of boxes": boxes.
  const numberOf = tokens.findIndex((t, i) => t.lower === "number" && tokens[i + 1]?.lower === "of");
  if (!top && numberOf >= 0) top = headAfter(tokens, numberOf + 2).unit;
  // "how many times can he go": a count, of nothing.
  const count = !top && /\bhow many times\b/.test(lower);
  const moneySaid = amounts.some((a) => (a.unit[MONEY] ?? 0) > 0);
  if ((/\bin dollars\b|\bmoney\b|\bcost|\bpay|\bspend|\bspent|\bprofit|\bcharge|\bworth|\bprice|\bincome|\bsalary|\bbudget/.test(lower) || (moneySaid && /\bearn|\bmake\b|\bmade\b|\bsave/.test(lower))) && (!top || top === "money" || top === "profit")) top = MONEY;
  if (!top && /\bhow long\b/.test(lower)) {
    const t = amounts.map((a) => Object.keys(a.unit).find((k) => /^(minute|hour|day|week|month|year|second)$/.test(k) && a.unit[k]! > 0)).find(Boolean);
    top = t ?? "hour";
  }
  if (!top && /\bhow far\b/.test(lower)) top = amounts.map((a) => Object.keys(a.unit).find((k) => lex.measures(k) === "Length" && a.unit[k]! > 0)).find(Boolean) ?? "mile";
  if (!top && /\bhow old\b/.test(lower)) top = "year";
  // "How much does he need to pay": money is what is asked when the amounts are money.
  if (!top && !count && amounts.some((a) => a.unit[MONEY] === 1 && Object.keys(a.unit).length === 1)) top = MONEY;
  if (!top && !count) {
    // The unit of the amounts most counted.
    const counts = new Map<string, number>();
    for (const a of amounts) for (const [k, v] of Object.entries(a.unit)) if (v > 0) counts.set(k, (counts.get(k) ?? 0) + 1);
    top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  if (!top && !count) return undefined;
  // "... a week", "every day", "per hour" in the question: asked per that.
  let per: string | undefined;
  // "how many did each of his friends receive", "how much does each person pay": per one of them.
  const eachAt = tokens.findIndex((t, k) => (t.lower === "each" || t.lower === "every") && k > many);
  if (eachAt >= 0) {
    const of = tokens[eachAt + 1]?.lower === "of" ? eachAt + 2 : eachAt + 1;
    const h = headAfter(tokens, of);
    if (h.unit && h.unit !== top && !TIME.test(h.unit)) per = h.unit;
  }
  for (let i = 0; i < tokens.length; i++) {
    const p = perAfter(tokens, i);
    if (!per && p.per && p.per !== top && /^(day|week|month|year|hour|minute)$/.test(p.per)) {
      // Only when the amounts are counted per it too.
      if (amounts.some((a) => (a.unit[p.per!] ?? 0) < 0)) per = p.per;
      break;
    }
  }
  // The one asked about; several named ("Toulouse, Charleston, and Seattle") are asked about together.
  const holders = tokens.filter((t, i) => i > 0 && /^[A-Z]/.test(t.text) && !t.tags.includes("Pronoun") && amounts.some((a) => a.holder === plain(t.text)));
  const named = new Set(holders.map((t) => plain(t.text))).size === 1 ? holders[0] : undefined;
  // "How much does the discounted subscription cost": the price of one, when every price said is
  // per one of it and no count of them is.
  if (!per && top === MONEY) {
    const named = new Set(tokens.map((t) => base(t.text)));
    const priced = amounts.filter((a) => a.unit[MONEY] === 1).map((a) => Object.keys(a.unit).find((k) => a.unit[k] === -1));
    const thing = priced[0];
    if (thing && priced.every((x) => x === thing) && named.has(thing) && !amounts.some((a) => a.unit[thing] === 1)) per = thing;
  }
  // The kind asked about: a word of the question that is some amount's kind ("how many gold coins").
  const said = new Set(tokens.flatMap((t) => [t.lower, lemma(t.lower), base(t.text)]));
  const kind = amounts.find((a) => a.kind && a.derived && said.has(a.kind))?.kind ?? amounts.find((a) => a.kind && said.has(a.kind))?.kind;
  return {
    ...(kind ? { kind } : {}),
    unit: unitOf(top, per),
    more: /\bhow (many|much) (more|fewer|less|longer|older|younger|further|farther)\b|\bby how (many|much)\b|\bcompared (to|with)\b|\bdifference\b/.test(all),
    ...(named ? { holder: plain(named.text) } : {}),
    left: /\b(left|remain|remaining|remainder|rest|leftover|unused|not (be )?used|not (be )?sold|not (be )?eaten)\b/.test(all),
    total: /\b(total|together|altogether|in all|combined|overall|both)\b/.test(lower) || new Set(holders.map((t) => plain(t.text))).size > 1,
    said: question,
  };
}

/* ------------------------------------------------------------------ *
 * Combining amounts until the units come out as asked.
 * ------------------------------------------------------------------ */

interface Worked {
  readonly value: number;
  readonly unit: Unit;
  /** Which amounts it uses, as a bit set. */
  readonly used: number;
  /** How it was worked out, said. */
  readonly how: string;
  readonly steps: readonly string[];
  /** What its steps agree or disagree with in the words, counted ("plus:total", "times:beside"). */
  readonly features: Readonly<Record<string, number>>;
  readonly divisions: number;
  readonly depth: number;
  /** What its doing does to it: kept through what it is multiplied by ("3 kg lost a month" × 4 months). */
  readonly sign: number;
}

/** How many readings of each set of amounts are kept while searching. */
const KEEP = 24;

/**
 * What each thing a reading agrees or disagrees with counts for. These are where weighing starts;
 * what worked examples show (`learnWeights`) moves them, and what is learned is kept on the
 * `Situations` Concept as `Weighs("feature", value)`, read over these.
 */
export const PRIOR: Readonly<Record<string, number>> = {
  "plus:sign": 1, "plus:against": -2, "plus:total": 1, "plus:left": -0.5, "plus:more": -2, "plus:rates": -1.5,
  "minus:sign": 2, "minus:unsigned": -1, "minus:left": 1.5, "minus:more": 3, "minus:total": -1,
  "times:ratio": 0.5, "times:beside": 1.5, "times:kind": 1.5, "times:otherKind": -2,
  divisions: -0.5, depth: -0.05, whole: 1, positive: 1, negative: -5,
  converts: -0.75, owed: -1.5, again: -1.5, theirs: 3, ratioLeft: -4,
};

/** The weights in use: the prior, with what has been learned over it. */
export function weightsOf(store: ConceptStore): Record<string, number> {
  const w: Record<string, number> = { ...PRIOR };
  for (const t of store.asSubject("Situations")) {
    if (t.predicate !== "Weighs" || !isCall(t.expr)) continue;
    const f = t.expr.args[0]?.value;
    const v = t.expr.args[1]?.value;
    if (typeof f === "string" && typeof v === "number") w[f] = v;
  }
  return w;
}

const plus = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>, extra: readonly string[] = []): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  for (const k of extra) out[k] = (out[k] ?? 0) + 1;
  return out;
};

const round = (n: number) => Math.round(n * 1e9) / 1e9;
const show = (n: number) => (Number.isInteger(round(n)) ? String(round(n)) : String(round(n)));

export interface Solved {
  readonly value: number;
  readonly unit: Unit;
  readonly how: string;
  readonly steps: readonly string[];
  readonly amounts: readonly Amount[];
  readonly asked: Asked;
  /** How far the answer's reading leads the next one that comes out different (0 when tied). */
  readonly margin: number;
  /** How many readings of the same unit came out at all. */
  readonly rivals: number;
  /** What the reading taken agreed and disagreed with, counted. */
  readonly features: Readonly<Record<string, number>>;
}

/** A reading of a situation, ranked: its value and what it agreed with. */
export interface Reading {
  readonly value: number;
  readonly features: Readonly<Record<string, number>>;
  readonly score: number;
}

/** The weights the next solve weighs by (set by situationOf from the store, or by learning). */
let weights: Record<string, number> = { ...PRIOR };
export function weighWith(w: Record<string, number>): void {
  weights = w;
}

export function solve(amounts: readonly Amount[], asked: Asked): Solved | undefined {
  const r = readings(amounts, asked);
  return r?.best;
}

/** Every reading that comes out as asked, best first, and the one taken. */
export function readings(amounts: readonly Amount[], asked: Asked): { best?: Solved; ranked: Reading[] } | undefined {
  const n = amounts.length;
  if (!n || n > 8) return undefined;
  // What a doing takes away counts only against something had: an amount taken away beside one
  // that was not, in another sentence ("has 16 ... eats 3"), or a question about what is left.
  // "He sold 86 ... sold twice that many" asks how many were sold, all of them.
  const tops = (u: Unit) => Object.keys(u).filter((k) => u[k]! > 0).join();
  const told = (a: Amount) => a.sentence >= 0 && !a.optional;
  const signs = asked.left || amounts.some((a) => told(a) && a.sign < 0 && amounts.some((b) => told(b) && b.sign >= 0 && b.sentence !== a.sentence && tops(a.unit) === tops(b.unit)));
  const by = new Map<number, Worked[]>();
  const keyed = new Map<number, Map<string, Worked>>();
  const W = weights;
  const dot = (f: Readonly<Record<string, number>>) => {
    let s = 0;
    for (const k in f) s += (W[k] ?? 0) * f[k]!;
    return s;
  };
  // What a reading is, beyond its steps: how deep, whole or not, more than nothing.
  const own = (w: Worked): Record<string, number> => ({ depth: w.depth, ...(Number.isInteger(round(w.value)) ? { whole: 1 } : {}), ...(w.value > 0 ? { positive: 1 } : { negative: 1 }) });
  const score = (w: Worked) => dot(w.features) + dot(own(w));
  const add = (w: Worked) => {
    // One per value and unit: the one that fits the words best.
    const list = keyed.get(w.used) ?? new Map<string, Worked>();
    const key = `${round(w.value)}|${sayUnit(w.unit)}`;
    const was = list.get(key);
    if (!was || score(w) > score(was)) list.set(key, w);
    keyed.set(w.used, list);
  };
  const settle = (m: number) => {
    // Keep the search small: the best few per subset.
    const list = [...(keyed.get(m)?.values() ?? [])].sort((x, y) => score(y) - score(x));
    by.set(m, list.slice(0, KEEP));
    keyed.delete(m);
  };
  amounts.forEach((a, i) => {
    add({ value: a.value, unit: a.unit, used: 1 << i, how: show(a.value), steps: [], features: {}, divisions: 0, depth: 0, sign: a.sign });
    settle(1 << i);
  });
  // Subsets in order of size: each made of two smaller disjoint ones.
  const masks = [...Array(1 << n).keys()].filter((m) => m > 0).sort((a, b) => bits(a) - bits(b));
  for (const m of masks) {
    if (bits(m) < 2) continue;
    for (let s = (m - 1) & m; s > 0; s = (s - 1) & m) {
      const t = m ^ s;
      if (s < t) continue;
      for (const a of by.get(s) ?? []) {
        for (const b of by.get(t) ?? []) {
          for (const w of combine(a, b, amounts, asked, signs)) add(w);
        }
      }
    }
    settle(m);
  }
  // The answer: what comes out in the unit asked, using as much of what was told as it can (each
  // amount left out costs), and only what the one asked about has when the question names one.
  // What was stated is owed; what was worked out from it is there to use, not owed.
  const owed = (m: number) => amounts.filter((a, i) => !a.optional && !a.consumed && !a.derived && (m & (1 << i)) === 0).length;
  // Counting again what another amount was worked out from, unless all of them are asked for.
  const again = (m: number) => (asked.total || asked.more ? 0 : amounts.filter((a, i) => a.consumed && (m & (1 << i)) !== 0).length);
  const usesRatios = (w: Worked) => amounts.every((a, i) => !a.ratio || (w.used & (1 << i)) !== 0);
  const theirs = (w: Worked) =>
    !asked.total &&
    ((!!asked.kind && amounts.every((a, i) => (w.used & (1 << i)) === 0 || a.optional || (a.kind === asked.kind && !a.consumed))) ||
      (!!asked.holder && !asked.kind && amounts.every((a, i) => (w.used & (1 << i)) === 0 || a.optional || (a.holder === asked.holder && !a.consumed))));
  // A conversion is used only when it is needed.
  const converts = (m: number) => amounts.filter((a, i) => a.sentence === -1 && (m & (1 << i)) !== 0).length;
  const answerFeatures = (w: Worked): Record<string, number> =>
    plus(plus(w.features, own(w)), { converts: converts(w.used), owed: owed(w.used), again: again(w.used), ...(theirs(w) ? { theirs: 1 } : {}), ...(usesRatios(w) ? {} : { ratioLeft: 1 }) });
  const total = (w: Worked) => dot(answerFeatures(w));
  // What can be: things counted come whole, money in cents; a reading that comes to 7.5 lollipops
  // is not one, when another can be.
  const whole = (w: Worked) => {
    const v = round(w.value);
    const cents = Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
    const counts = Object.keys(asked.unit).every((k) => k === MONEY || !TIME.test(k)) && !Object.keys(asked.unit).some((k) => !!lex.measures(k) && lex.measures(k) !== "Money" && lex.measures(k) !== "Time");
    return asked.unit[MONEY] ? cents : counts ? Number.isInteger(v) : Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  };
  const all = masks.flatMap((m) => by.get(m) ?? []).filter((w) => sameUnit(w.unit, asked.unit) && w.value > 0);
  // None can be: not worked out, rather than said as if it were.
  const pool = all.filter(whole).sort((x, y) => total(y) - total(x));
  const best = pool[0];
  const ranked = pool.filter((w) => owed(w.used) <= 2).map((w) => ({ value: round(w.value), features: answerFeatures(w), score: total(w) }));
  if (best && owed(best.used) <= 2) {
    const next = pool.find((w) => Math.abs(w.value - best.value) > 1e-9);
    const margin = next ? total(best) - total(next) : 99;
    return { best: { value: round(best.value), unit: best.unit, how: best.how, steps: best.steps, amounts, asked, margin, rivals: pool.length, features: answerFeatures(best) }, ranked };
  }
  return { ranked };
}

const bits = (m: number) => {
  let c = 0;
  for (let x = m; x > 0; x = x & (x - 1)) c++;
  return c;
};

/** Every way two worked amounts combine whose units allow it. */
function combine(a: Worked, b: Worked, amounts: readonly Amount[], asked: Asked, signs: boolean): Worked[] {
  const out: Worked[] = [];
  const used = a.used | b.used;
  const depth = Math.max(a.depth, b.depth) + 1;
  const signOf = (w: Worked) => {
    // An amount carries the sign its doing gives it, and so does what it is multiplied into.
    return signs ? w.sign : 0;
  };
  const ratioOf = (w: Worked) => bits(w.used) === 1 && amounts[Math.log2(w.used)]!.ratio === true;
  // What the doings of the amounts put together are: "minus|eat" is something eaten taken away.
  const doingOf = (w: Worked) => (bits(w.used) === 1 ? amounts[Math.log2(w.used)]!.doing : undefined);
  const lexical = (op: string, x: Worked, y: Worked): string[] => {
    const dx = doingOf(x), dy = doingOf(y);
    return op === "+" ? [dx, dy].filter((d): d is string => !!d).map((d) => `plus|${d}`) : op === "-" ? [...(dx ? [`from|${dx}`] : []), ...(dy ? [`minus|${dy}`] : [])] : op === "×" ? [dx, dy].filter((d): d is string => !!d).map((d) => `times|${d}`) : [...(dx ? [`over|${dx}`] : []), ...(dy ? [`by|${dy}`] : [])];
  };
  const step = (value: number, unit: Unit, how: string, op: string, fit: readonly string[], division = 0): Worked => ({
    value,
    unit,
    used,
    how,
    steps: [...a.steps, ...b.steps, `${show(a.value)} ${op} ${show(b.value)} = ${sayAmount(value, unit)}`],
    features: plus(plus(a.features, b.features), division ? { divisions: division } : {}, fit),
    divisions: a.divisions + b.divisions + division,
    depth,
    sign: op === "×" || op === "÷" ? a.sign || b.sign : 0,
  });
  // A rate is not added to a rate unless a rate is asked: prices are multiplied by what they price.
  const rate = (u: Unit) => Object.values(u).some((v) => v < 0);
  const askedRate = rate(asked.unit);
  // Amounts said side by side go together: "3 dozen donuts which cost $68 per dozen".
  const leafAt = (w: Worked) => (bits(w.used) === 1 ? Math.log2(w.used) : -1);
  const beside = leafAt(a) >= 0 && leafAt(b) >= 0 && Math.abs(leafAt(a) - leafAt(b)) === 1 && amounts[leafAt(a)]!.sentence === amounts[leafAt(b)]!.sentence;
  // A conversion ("7 days in a week") is only ever multiplied or divided by.
  const conversion = (w: Worked) => amounts.every((x, i) => (w.used & (1 << i)) === 0 || x.sentence === -1);
  if (sameUnit(a.unit, b.unit) && !ratioOf(a) && !ratioOf(b) && !conversion(a) && !conversion(b)) {
    // Added: what is added, or all of it together. Taken away: what is removed from what was had.
    const plusFit = [signOf(b) >= 0 ? "plus:sign" : "plus:against", ...(asked.total ? ["plus:total"] : []), ...(asked.left ? ["plus:left"] : []), ...(asked.more ? ["plus:more"] : []), ...(rate(a.unit) && !askedRate ? ["plus:rates"] : [])];
    out.push(step(a.value + b.value, a.unit, `(${a.how} + ${b.how})`, "+", [...plusFit, ...lexical("+", a, b)]));
    for (const [x, y] of [[a, b], [b, a]] as const) {
      if (x.value - y.value <= 0) continue;
      const minusFit = [signOf(y) < 0 ? "minus:sign" : "minus:unsigned", ...(asked.left ? ["minus:left"] : []), ...(asked.more ? ["minus:more"] : []), ...(asked.total ? ["minus:total"] : [])];
      out.push({
        ...step(x.value - y.value, a.unit, `(${x.how} - ${y.how})`, "-", [...minusFit, ...lexical("-", x, y)]),
        steps: [...a.steps, ...b.steps, `${show(x.value)} - ${show(y.value)} = ${sayAmount(x.value - y.value, a.unit)}`],
      });
    }
  }
  // Multiplied: units multiply. A ratio only ever multiplies.
  const product = times(a.unit, b.unit);
  // A product means something when a unit cancels (eggs a day × days) or one side counts nothing
  // of its own (a ratio, "twice"); month × sheet is not a thing.
  const cancels = Object.keys(a.unit).some((k) => (a.unit[k] ?? 0) * (b.unit[k] ?? 0) < 0);
  const bare = !Object.keys(a.unit).length || !Object.keys(b.unit).length;
  const meaningful = Object.values(product).every((v) => Math.abs(v) <= 1) && (cancels || bare);
  // Of the same kind, they go together ("30 small holes" × "3 minutes a small hole"); of different kinds, not.
  const kindA = leafAt(a) >= 0 ? amounts[leafAt(a)]!.kind : undefined;
  const kindB = leafAt(b) >= 0 ? amounts[leafAt(b)]!.kind : undefined;
  const kinds = kindA && kindB ? (kindA === kindB ? ["times:kind"] : ["times:otherKind"]) : [];
  if (meaningful) out.push(step(a.value * b.value, product, `${a.how} × ${b.how}`, "×", [...(ratioOf(a) || ratioOf(b) ? ["times:ratio"] : []), ...(beside ? ["times:beside"] : []), ...kinds, ...lexical("×", a, b)]));
  // Divided: units divide; not by a ratio's opposite, nothing by zero.
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (y.value === 0 || ratioOf(x)) continue;
    const q = times(x.unit, y.unit, -1);
    if (!Object.values(q).every((v) => Math.abs(v) <= 1)) continue;
    const w = step(x.value / y.value, q, `${x.how} ÷ ${y.how}`, "÷", lexical("÷", x, y), 1);
    out.push({ ...w, steps: [...a.steps, ...b.steps, `${show(x.value)} ÷ ${show(y.value)} = ${sayAmount(x.value / y.value, q)}`] });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Reading the message.
 * ------------------------------------------------------------------ */

export interface Situation {
  readonly amounts: Amount[];
  readonly asked: Asked;
}

/** A time of day in hours from midnight: "1:30 PM" 13.5, "4 PM" 16, "9:00" 9 (the half after is taken from the other). */
function clock(h: string, m: string | undefined, half: string | undefined, other?: string): number {
  const ampm = (half ?? other ?? "").toLowerCase();
  let hours = Number(h) % 12 + (m ? Number(m) / 60 : 0);
  if (ampm.startsWith("p")) hours += 12;
  if (!ampm && Number(h) === 12) hours = 12 + (m ? Number(m) / 60 : 0);
  return hours;
}

/** "from 1:00 PM to 5:00 PM", "from 1 to 4 PM": said as how long it is, "for 4 hours". */
function spans(message: string): string {
  return message.replace(/\bfrom (\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/gi, (whole, h1, m1, a1, h2, m2, a2) => {
    if (!a1 && !a2 && !m1 && !m2) return whole;
    let hours = clock(h2, m2, a2, a1) - clock(h1, m1, a1, a2);
    if (hours <= 0) hours += 24;
    return `for ${Math.round(hours * 100) / 100} hours`;
  });
}

/** A message read as a situation and what it asks, or undefined when it is not one. */
export function situationOf(store: ConceptStore, said: string): Situation | undefined {
  lex = lexicon(store);
  weights = weightsOf(store);
  const message = spans(said);
  const sentences = message
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z$0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length < 2 && !/\d/.test(message)) return undefined;
  // The question: the last sentence that asks, or the clause of the last sentence that does.
  let q = sentences.length - 1;
  while (q >= 0 && !/\?\s*$/.test(sentences[q]!) && !/\bhow (much|many|long|far|old)\b/i.test(sentences[q]!)) q--;
  if (q < 0) return undefined;
  const last: Last = { dozens: /\b(per|a|each|the|by the) dozen\b/i.test(message) };
  const amounts: Amount[] = [];
  // The question's clause is the one that asks ("how many ..."); a condition said beside it ("if
  // Seattle has 20 sheep") states amounts like any sentence.
  const clauses = sentences[q]!.split(/\s*,?\s*\b(?=if\b|when\b|given that\b|how (?:much|many|long|far|old)\b)/i).map((x) => x.replace(/,\s*$/, "")).filter((x) => x.trim());
  const asking = clauses.findIndex((x) => /\bhow (much|many|long|far|old)\b|\bwhat (is|was|will|are)\b/i.test(x));
  const question = asking >= 0 ? clauses[asking]! : sentences[q]!;
  sentences.forEach((s, i) => {
    if (i !== q) amounts.push(...amountsIn(store, s, i, last));
    else for (const [k, part] of clauses.entries()) if (k !== asking) amounts.push(...amountsIn(store, part.replace(/^(if|when|given that)\s+/i, ""), i, last));
  });
  // The question can say amounts too ("her height after 10 years"): past what it asks for, and not owed.
  const rest = question.replace(/\bhow (much|many|long|far|old)\b(\s+[A-Za-z]+){0,2}/i, "");
  amounts.push(...amountsIn(store, rest, q, { ...last }, true).filter((a) => !a.ratio));
  // "in a year", "every month": one of it, there to use.
  const span = /\b(?:in|for|per|over|during|within|each|every|a|one)\s+(?:a\s+|an\s+|one\s+)?(second|minute|hour|day|week|month|year)\b/i.exec(question);
  if (span && !amounts.some((a) => a.optional && a.unit[base(span[1]!)] === 1)) amounts.push({ value: 1, unit: { [base(span[1]!)]: 1 }, said: `1 ${base(span[1]!)}`, sentence: q, sign: 0, optional: true });
  // "Harald's" is Harald.
  const named = amounts.map((a) => ({ ...a, ...(a.holder ? { holder: plain(a.holder) } : {}), ...(a.of?.holder ? { of: { ...a.of, holder: plain(a.of.holder) } } : {}) }));
  const cap = named.find((a) => a.capacity);
  const top = (a: Amount) => Object.keys(a.unit).filter((k) => a.unit[k]! > 0).join();
  const held = cap ? named.map((a) => (a === cap ? { ...a, sign: 1 } : top(a) === top(cap) && a.sign === 0 ? { ...a, sign: -1 } : a)) : named;
  const resolved = resolveRatios(held);
  // "He kept 5 lollipops and shared the remaining", "the rest went to ...": said with no number,
  // what is left by then of what was had first, less the others of it said since.
  sentences.forEach((sentence, at) => {
    if (at === q || !/\b(the remaining|the rest|the remainder|what was left|what is left|the leftovers?)\b(?!\s+(of|\d))/i.test(sentence)) return;
    if (resolved.some((a) => a.sentence === at && a.derived && /what was left/.test(a.said))) return;
    // Of the thing said more than once by then: what was had and what went.
    const plainUnit = (a: Amount) => a.sentence <= at && !a.ratio && !a.optional && Object.keys(a.unit).length === 1 && (Object.values(a.unit)[0] ?? 0) > 0;
    const thing = [...resolved].reverse().find((a) => plainUnit(a) && resolved.filter((b) => plainUnit(b) && sameUnit(b.unit, a.unit)).length >= 2);
    if (!thing) return;
    const same = resolved.filter((a) => a.sentence <= at && !a.ratio && !a.optional && sameUnit(a.unit, thing.unit));
    const had = same[0];
    if (!had || same.length < 2) return;
    const left = same.slice(1).reduce((n, a) => n - a.value, had.value);
    if (!(left > 0)) return;
    for (const a of same) resolved[resolved.indexOf(a)] = { ...a, consumed: true };
    resolved.push({ value: left, unit: had.unit, said: `what was left: ${[had, ...same.slice(1)].map((a) => show(a.value)).join(" - ")} = ${show(left)}`, sentence: at, sign: 0, derived: true });
  });
  if (resolved.length < 2 && !resolved.some((a) => a.derived)) return undefined;
  // Each unit by the word the graph has for it: "ml" is milliliter, "kids" are children.
  const canon = (u: Unit): Unit => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(u)) {
      const named = chain(store, nameOf(k)).at(-1) ?? nameOf(k);
      const word = named === nameOf(k) ? k : named.toLowerCase();
      out[word] = (out[word] ?? 0) + v;
    }
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0));
  };
  resolved.splice(0, resolved.length, ...resolved.map((a) => ({ ...a, unit: canon(a.unit) })));
  // A rate per something nothing counts ("A boy has 5 cards", and no boys are counted) is just the amount.
  const counts = new Set(resolved.flatMap((a) => Object.keys(a.unit).filter((k) => a.unit[k]! > 0)));
  const askedText = question.toLowerCase();
  const usable = resolved.map((a) => {
    const per = Object.keys(a.unit).filter((k) => a.unit[k]! < 0);
    if (per.length !== 1 || a.ratio || TIME.test(per[0]!) || counts.has(per[0]!) || askedText.includes(per[0]!)) return a;
    return { ...a, unit: Object.fromEntries(Object.entries(a.unit).filter(([k]) => k !== per[0])) };
  });
  resolved.splice(0, resolved.length, ...usable);
  // "He worked for an entire week": a week of it, there to use.
  sentences.forEach((sentence, i) => {
    const span = /\b(?:for|during|over|throughout)\s+(?:a|an|one)\s+(?:whole\s+|entire\s+|full\s+)?(second|minute|hour|day|week|month|year)\b/i.exec(sentence);
    if (span && i !== q) resolved.push({ value: 1, unit: { [base(span[1]!)]: 1 }, said: `1 ${base(span[1]!)}`, sentence: i, sign: 0, optional: true });
  });
  const plainAsked = askedIn(question, resolved, sentences[q]!);
  if (!plainAsked) return undefined;
  const found = { ...plainAsked, unit: canon(plainAsked.unit) };
  // "How many animals", "how many people", "how many pieces": a word for all the things counted,
  // when none is counted by that word. Each count of things is one of them.
  const askedTop = Object.keys(found.unit).find((k) => found.unit[k]! > 0);
  const things = (a: Amount) => Object.keys(a.unit).filter((k) => a.unit[k]! > 0 && k !== MONEY && !TIME.test(k));
  const asked = found;
  if (askedTop && askedTop !== MONEY && !TIME.test(askedTop) && !resolved.some((a) => (a.unit[askedTop] ?? 0) > 0)) {
    // Not what holds them: "3 groups" are not people.
    const holders = new Set(resolved.flatMap((a) => Object.keys(a.unit).filter((k) => a.unit[k]! < 0)));
    const counted = new Set(resolved.filter((a) => !a.ratio && a.sentence !== -1).flatMap(things).filter((k) => !holders.has(k)));
    if (counted.size > 1) {
      for (let k = 0; k < resolved.length; k++) {
        const a = resolved[k]!;
        const own = things(a);
        if (a.ratio || own.length !== 1 || holders.has(own[0]!)) continue;
        resolved[k] = { ...a, unit: times(times(a.unit, { [own[0]!]: -1 }), { [askedTop]: 1 }) };
      }
    }
  }
  return { amounts: [...resolved, ...conversions(store, resolved, asked, question)], asked };
}

/**
 * What a comparison is of, when that is never told, is the unknown: "30 more gold coins than
 * silver coins" with 110 coins in all is x + (x + 30) = 110; "Mina memorized six times as many as
 * Carlos" with Mina's 24 is 6x = 24; "$19.50 ... with a 25% discount from the original price" is
 * 0.75x = 19.50. Each comparison is a line in x (a·x + b); the equation is the amount the same one
 * is said to have, else the whole it is part of. Returns whether any was solved.
 */
function unknowns(list: (Amount & { derived?: boolean })[], same: (a?: string, b?: string) => boolean): boolean {
  const open = list.filter((r) => r.ratio && r.of && !r.of.left && (r.of.named || (r.of.holder && !list.some((a) => !a.ratio && same(a.holder, r.of!.holder))) || r.of.change !== undefined));
  let solved = false;
  const groups = new Map<string, typeof open>();
  for (const r of open) {
    const key = r.of!.named ?? r.of!.holder ?? "the original";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, rs] of groups) {
    const line = (r: Amount): [number, number] => (r.of!.differs !== undefined ? [1, r.of!.differs * r.value] : r.of!.change !== undefined ? [1 + r.of!.change * r.value, 0] : [r.value, 0]);
    const top = (a: Amount) => Object.keys(a.unit).filter((k) => a.unit[k]! > 0).join();
    const known = (a: Amount) => !a.ratio && !a.consumed && !a.optional;
    let x: number | undefined;
    let used: Amount | undefined;
    let said = "";
    // The same one said to have an amount of the same kind: that is what the comparison comes to.
    for (const r of rs) {
      const [a, b] = line(r);
      const at = list.indexOf(r);
      const s =
        r.of!.change !== undefined
          ? list.slice(0, at).reverse().find((o) => known(o) && !o.whole)
          : list.find((o) => o !== r && known(o) && !o.whole && same(o.holder, r.holder) && o.kind === r.kind && (top(o) === top(r) || !top(r)));
      if (s && a !== 0) {
        x = (s.value - b) / a;
        used = s;
        said = `${show(a)}x${b ? (b > 0 ? ` + ${show(b)}` : ` - ${show(-b)}`) : ""} = ${show(s.value)}`;
        break;
      }
    }
    // Else the whole it is part of: the other side and the comparison together.
    if (x === undefined && rs.length === 1 && rs[0]!.of!.change === undefined) {
      const r = rs[0]!;
      const [a, b] = line(r);
      const w = list.find((o) => o !== r && known(o) && (o.whole || !o.kind) && (top(o) === top(r) || !top(r)));
      if (w) {
        x = (w.value - b) / (1 + a);
        used = w;
        said = `x + ${a === 1 ? "x" : `${show(a)}x`}${b ? (b > 0 ? ` + ${show(b)}` : ` - ${show(-b)}`) : ""} = ${show(w.value)}`;
      }
    }
    if (x === undefined || !(x > 0) || !used) continue;
    solved = true;
    const unit = Object.keys(rs[0]!.unit).length ? rs[0]!.unit : used.unit;
    list[list.indexOf(used)] = { ...used, consumed: true };
    for (const r of rs) {
      const [a, b] = line(r);
      const value = a * x + b;
      list[list.indexOf(r)] = { value, unit, said: `${r.kind ?? r.holder ?? "the other"} = ${show(value)}`, sentence: r.sentence, sign: r.sign, ...(r.holder ? { holder: r.holder } : {}), ...(r.kind ? { kind: r.kind } : {}), derived: true };
    }
    const holder = rs[0]!.of!.holder;
    list.splice(list.indexOf(list.find((a) => a.sentence >= rs[0]!.sentence) ?? list[0]!), 0, { value: x, unit, said: `${key}: ${said}, so x = ${show(x)}`, sentence: rs[0]!.sentence, sign: 0, ...(holder ? { holder } : {}), kind: rs[0]!.of!.named ?? key, derived: true });
  }
  return solved;
}

/**
 * How the units said convert, from what the graph holds of them (`Year Holds(Month(), 12)`): one
 * offered for each pair of units in play, a year and the months a car is washed in, there to use
 * and not owed. "in a year" in the question puts a year in play.
 */
function conversions(store: ConceptStore, amounts: readonly Amount[], asked: Asked, question: string): Amount[] {
  const units = new Set([...amounts.flatMap((a) => Object.keys(a.unit)), ...Object.keys(asked.unit)]);
  for (const w of question.toLowerCase().match(/[a-z]+/g) ?? []) if (TIME.test(base(w))) units.add(base(w));
  const out: Amount[] = [];
  for (const big of units) {
    for (const t of store.asSubject(nameOf(big))) {
      if (t.predicate !== "Holds" || !isCall(t.expr)) continue;
      const small = t.expr.args[0]?.value;
      const n = t.expr.args[1]?.value;
      if (!isCall(small) || typeof n !== "number") continue;
      const unit = small.head.toLowerCase();
      if (!units.has(unit) || unit === big) continue;
      out.push({ value: n, unit: { [unit]: 1, [big]: -1 }, said: `${n} ${unit}s in a ${big}`, sentence: -1, sign: 0, optional: true });
    }
  }
  return out;
}

/**
 * Each ratio made the amount it says, from what it is a ratio of: "Toulouse has twice as many sheep
 * as Charleston" is Toulouse's 2 × Charleston's sheep, once Charleston's are known, in whatever
 * order the sentences tell them. A ratio whose referent never comes stays a ratio.
 */
function resolveRatios(said: readonly Amount[]): Amount[] {
  const list: (Amount & { derived?: boolean })[] = [...said];
  const replaced = new Set<Amount>();
  const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase().replace(/'s$/, "") === b.toLowerCase().replace(/'s$/, "");
  const settle = () => {
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!;
      if (!r.ratio || !r.of) continue;
      // Never a whole said of all of them, and when the other side is a kind of its own ("than
      // silver coins"), only an amount of that kind.
      const named = r.of.named;
      const fits = (a: Amount) => !a.ratio && !a.whole && (!r.of!.unit || (a.unit[r.of!.unit] ?? 0) > 0) && (!named || a.kind === named || ((a.unit[named] ?? 0) > 0 && !a.kind));
      let ref: Amount | undefined;
      if (r.of.left) {
        // What is left by then: what was had, less what was taken away before it.
        const before = list.slice(0, i).filter((a) => !a.ratio && !a.optional && (!r.of!.unit || (a.unit[r.of!.unit] ?? 0) > 0));
        const had = before.find((a) => a.sign >= 0);
        if (!had || before.some((a) => a.ratio)) continue;
        const kept = before.filter((a) => sameUnit(a.unit, had.unit)).reduce((n, a) => n + (a === had ? a.value : a.sign < 0 ? -a.value : 0), 0);
        const value = kept * r.value;
        list[i] = { value, unit: had.unit, said: `${r.said} of what was left (${show(kept)}) = ${show(value)}`, sentence: r.sentence, sign: r.sign, ...(r.holder ? { holder: r.holder } : {}), derived: true };
        changed = true;
        continue;
      }
      if (r.of.next) {
        // The amount said right after it, once worked out; counted in this one.
        const n = list[i + 1];
        if (!n || n.ratio) continue;
        ref = { ...n, said: n.said.replace(/ = [^=]*$/, "") };
        replaced.add(n);
      } else if (r.of.holder) ref = [...list].reverse().find((a) => fits(a) && same(a.holder, r.of!.holder));
      // What was said before it, else what is said after ("50% more ... if he paid $18").
      else if (r.of.last && r.of.thing) ref = list.slice(0, i).reverse().find((a) => fits(a) && !a.derived) ?? list.slice(i + 1).find(fits);
      else if (r.of.last) ref = list.slice(0, i).reverse().find(fits) ?? list.slice(i + 1).find(fits) ?? (named ? undefined : list.slice(0, i).reverse().find((a) => !a.ratio && !a.whole));
      if (!ref) continue;
      const value = r.of.differs !== undefined ? ref.value + r.of.differs * r.value : r.of.change !== undefined ? ref.value * (1 + r.of.change * r.value) : ref.value * r.value;
      const of = ref.derived ? show(ref.value) : ref.said;
      // Said the way it was worked: "38 - 30", "$80 less 45%", "half of 38", "twice 80".
      const how =
        r.of.differs !== undefined ? `${of} ${r.of.differs > 0 ? "+" : "-"} ${show(r.value)}`
        : r.of.change !== undefined ? `${of} ${r.of.change > 0 ? "plus" : "less"} ${r.said}`
        : r.value < 1 ? `${r.said} of ${of}`
        : `${r.said} ${of}`;
      // A change makes a new state of the same thing ("with a 45% discount"): the old one is gone.
      // Said of another ("twice as many as Ben"), what it was worked from stays, not owed.
      // Someone else's ("as many as Ben"), or the same thing changed: what it was worked from is
      // counted in it. The same one's again ("he sold twice that many the year before") is more of theirs.
      if (r.of.change !== undefined || !same(ref.holder, r.holder)) list[list.indexOf(ref)] = { ...ref, consumed: true };
      list[i] = {
        value,
        unit: ref.unit,
        said: `${how} = ${show(value)}`,
        sentence: r.sentence,
        sign: r.sign,
        ...(r.doing ? { doing: r.doing } : {}),
        ...(r.holder ? { holder: r.holder } : {}),
        derived: true,
      };
      changed = true;
    }
  }
  };
  settle();
  if (unknowns(list, same)) settle();
  // A comparison whose other side is never told is just the amount it says.
  return list.filter((a) => !replaced.has(a)).map((a) => (a.ratio && a.of?.differs !== undefined ? { ...a, ratio: false } : a));
}

/** An amount said as people say it: 18 dollar/day is "18 dollars a day", 2 dozen "2 dozen". */
export function sayAmount(value: number, unit: Unit): string {
  const n = show(value);
  const one = Math.abs(round(value)) === 1;
  const top = Object.entries(unit).filter(([, v]) => v > 0).map(([k]) => k);
  const bottom = Object.entries(unit).filter(([, v]) => v < 0).map(([k]) => k);
  const plural = (w: string) => (one ? w : (lex.plural(w) ?? (/(s|x|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`)));
  const head = top.length ? `${n} ${top.map((w, i) => (i === top.length - 1 ? plural(w) : w)).join(" ")}` : n;
  return bottom.length ? `${head} ${bottom.map((w) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`)).join(" ")}` : head;
}

/** A situation read but not worked out, said with what was read: Unworked(read=List(...)). */
export function unworked(s: Situation): Expr {
  return call("Unworked", [{ name: "read", value: call("List", s.amounts.filter((a) => !a.consumed).map((a) => ({ value: a.said }))) }]);
}

/** How sure the answer is: the reading clearly ahead of any other that comes out different. */
export const sure = (s: Solved): boolean => s.margin >= 1.5;

/**
 * The answer as a Concept to say: Worked(answer, steps=List(...), read=List(...), sure=...), each
 * step said with its amounts' units, so the working can be checked.
 */
export function worked(s: Solved): Expr {
  return call("Worked", [
    { name: "answer", value: sayAmount(s.value, s.unit) },
    { name: "value", value: s.value },
    { name: "steps", value: call("List", s.steps.map((x) => ({ value: x }))) },
    { name: "read", value: call("List", s.amounts.filter((a) => a.derived).map((a) => ({ value: a.said }))) },
    { name: "sure", value: sure(s) },
  ]);
}

