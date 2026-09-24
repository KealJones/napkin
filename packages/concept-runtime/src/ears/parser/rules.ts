/**
 * A rule-based Ears: a message becomes the same lines the model writes, by grammar alone.
 *
 * Deterministic and inspectable: the same message always gives the same reading, and every
 * decision is a rule below that can be read and changed. It covers what the rules cover and
 * nothing else. Anything it cannot account for word by word returns `undefined`, and the
 * caller falls back to the model; a fallback is a rule not written yet, not a guess.
 *
 * Tagging is compromise's rule-and-lexicon tagger, corrected where its tags are known wrong
 * for this purpose. The rewrite from tags to Concepts follows `design/reading-spec.md`: the
 * first thing said is the head; a question word or a fronted helper leads a question; a
 * claim about a thing starts with the thing; an order starts with its verb; describing and
 * owning words wrap; an amount is its unit around its number; a clock time is a reading.
 */
import nlp from "compromise";
import { type Expr, c, format, isCall } from "../../concept/expression.js";
import { correct, expandBare, isWord, unclear } from "./words.js";
import { mathSpans } from "./math.js";
import { knownName, namesOneThing } from "./names.js";

interface Tok {
  word: string;
  /** As typed, for stress: "NOT" keeps its capitals here. */
  raw: string;
  tags: Set<string>;
  /** A comma followed this word. */
  comma: boolean;
}

/** Spans the rules kept as `Unclear` because they could not read them, this parse. */
let unread: string[] = [];

class Unparsed extends Error {
  /** Where a clause read fine and then had words left over. */
  leftAt?: number;
}
/**
 * Calls made by owning and describing words, which a claim's predicate descends through.
 * Tracked by object, not by name, so one parse never changes how the next one reads.
 */
const WRAPPERS = new WeakSet<object>();
const wrap = (head: string, inner: Expr): Expr => {
  const e = c(head, inner);
  WRAPPERS.add(e as object);
  return e;
};
const fail = (why: string): never => {
  throw new Unparsed(why);
};

/** A word's name, keeping the capitals of one typed camel-cased ("MoodDo", "TypeScript"). */
const named = (t: Tok): string => (/[a-z][A-Z]/.test(t.raw) ? t.raw.replace(/[^A-Za-z0-9]/g, "") : name(t.word));

const name = (w: string): string =>
  w
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join("");

const WH = new Set(["what", "who", "when", "where", "why", "how", "which"]);
const AUX = new Set(["is", "are", "was", "were", "am", "do", "does", "did", "can", "could", "will", "would", "should", "has", "have", "had", "be"]);
const COPULA = new Set(["is", "are", "was", "were", "am", "be", "'s", "'re", "'m"]);
const DET = new Set(["the", "a", "an", "some", "this", "that", "these", "those"]);
const POSSESSIVE: Record<string, string> = { my: "My", your: "Your", our: "Our", his: "His", her: "Her", their: "Their", its: "Its" };
const PERSON: Record<string, string> = { i: "Me", me: "Me", you: "You", we: "We", us: "We", they: "They", he: "He", she: "She" };
const POINTING = new Set(["it", "that", "this", "those", "these", "them", "em", "him", "her"]);
/**
 * Prepositions are a closed class, written out: taggers mistag them in context ("behind" as a
 * verb, "beside" as an adjective) and Penn-style lexicons lump them with "if" and "because".
 */
const PREP = new Set(("in on at for to of with about from by into onto over under after before until near as like per " +
  "without through during above across against along alongside amid among around atop behind below beneath beside " +
  "besides between beyond despite except inside outside past throughout toward towards underneath unlike upon via " +
  "within versus").split(" "));
const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|dozen)$/;
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
const ORDINAL = /^(first|second|third|fourth|fifth|last|next|previous|other)$/;
/** Interjections, from the tagger's lexicon ("lol", "omg", "meh", "oops"), less "please", which is a marker. */
const EXPRESSION: ReadonlySet<string> = new Set(
  Object.entries((nlp.model() as { one: { lexicon: Record<string, string | string[]> } }).one.lexicon)
    .filter(([w, t]) => /^[a-z]+$/.test(w) && [t].flat().includes("Expression") && !/^(please|pls|plz)$/.test(w))
    .map(([w]) => w),
);
/** A response said before a clause: an answer or an interjection. */
const responds = (w: string): boolean => ANSWER.test(w) || INTERJECTION.test(w) || EXPRESSION.has(w);

/** Whether the word k ahead starts a clause of its own: a question, a subject and verb, an order, a response. */
function opensClause(r: Reader, k: number): boolean {
  const w = r.word(k);
  if (!w) return false;
  if (WH.has(w) || AUX.has(w) || responds(w) || isFiller(w) || w === "please" || w === "let") return true;
  if (/^(if|because|unless|although|though|since|while|but)$/.test(w) || (w === "as" && /^(long|soon)$/.test(r.word(k + 1)))) return true;
  if ((PERSON[w] || POINTING.has(w)) && (r.is("Verb", k + 1) || COPULA.has(r.word(k + 1)) || AUX.has(r.word(k + 1)))) return true;
  return r.is("Imperative", k) || (r.is("Infinitive", k) && !r.is("Noun", k));
}

/** Words for the one spoken to: "homie", "dude", "bro". */
const VOCATIVE = /^(homie|dude|bro|bruh|man|buddy|fam|mate|pal|guys|yall|boss|chief|sir|friend)$/;

/** Words that answer: said on their own, never a subject. */
const ANSWER = /^(no|nope|nah|nay|yes|yeah|yep|yup|aye|sure|ok|okay)$/;
/** Leading words kept as an aside: filler, and any interjection but a yes or a no, which answers. */
const isFiller = (w: string): boolean =>
  /^(hmm|hm|hem|uhm|uhmm|um|so+|ok|okay|well|now|also|idk|wait|basically|yo)$/.test(w) ||
  (EXPRESSION.has(w) && !/^(no|nope|nah|nay|yes|yeah|yep|aye)$/.test(w));
const QUANTIFIER = new Set(["every", "each", "all", "some", "any", "no"]);
const PARTICLE = new Set(["out", "up", "off", "down", "away", "back", "over"]);
const SAYING = new Set(["say", "says", "print", "prints", "output", "outputs"]);
const INFIX: Record<string, string> = { times: "Times", plus: "Plus", minus: "Minus", over: "Over" };
const verbCache = new Map<string, boolean>();
/** Nouns the tagger's lexicon never lets be verbs, which are verbs in orders all the time. */
const ALSO_VERBS = new Set(["water", "email", "text", "message", "ship", "book", "fire", "plant", "field", "table", "list", "note", "time"]);
/** Whether a word can be a verb, asked of the lexicon rather than of its tag in context. */
function canBeVerb(w: string): boolean {
  if (!verbCache.has(w)) verbCache.set(w, ALSO_VERBS.has(w) || nlp(`i will ${w} it`).match(w).has("#Verb"));
  return verbCache.get(w)!;
}

function tokens(sentence: string): Tok[] {
  const out: Tok[] = [];
  for (const t of nlp(sentence).terms().json() as { terms: { text: string; implicit?: string; normal: string; tags: string[]; post?: string }[] }[]) {
    const term = t.terms[0];
    const word = (term.implicit || term.normal || term.text).toLowerCase();
    if (!word) continue;
    out.push({ word, raw: term.text || word, tags: new Set(term.tags), comma: (term.post ?? "").includes(",") });
  }
  return out;
}

class Reader {
  i = 0;
  constructor(readonly toks: Tok[]) {}
  peek(k = 0): Tok | undefined {
    return this.toks[this.i + k];
  }
  word(k = 0): string {
    return this.peek(k)?.word ?? "";
  }
  next(): Tok {
    return this.toks[this.i++] ?? fail("ran out of words");
  }
  done(): boolean {
    return this.i >= this.toks.length;
  }
  is(tag: string, k = 0): boolean {
    return this.peek(k)?.tags.has(tag) ?? false;
  }
}

/** Capitalised as typed means stressed: MarkEmphasis("NOT", ...). */
const stressed = (t: Tok, e: Expr): Expr =>
  t.raw.length > 1 && t.raw === t.raw.toUpperCase() && /[A-Z]/.test(t.raw) && t.word !== "i" ? c("MarkEmphasis", t.raw, e) : e;

function clock(w: string): Expr | undefined {
  const m = CLOCK.exec(w);
  if (!m || (!m[2] && !m[3])) return undefined;
  const args: Expr[] = [Number(m[1])];
  if (m[2]) args.push(Number(m[2]));
  if (m[3]) args.push(c(m[3] === "am" ? "Am" : "Pm"));
  return c("Time", ...args);
}

/** A noun phrase: determiners absorbed, owners and describers wrap, nouns fold into one kind. */
function nounPhrase(r: Reader, subject = false, stopAtVerb = false): Expr {
  // "maybe tuesday", "like 3 hours", "sort of blue": a hedge blurs what follows it.
  const hedge = /^(maybe|probably|perhaps|roughly|about|around|like|kinda|sorta|basically|literally|just)$/.test(r.word()) &&
    (r.is("Value", 1) || r.is("Noun", 1) || r.is("Date", 1) || NUMBER_WORD.test(r.word(1)) || DET.has(r.word(1)) || r.is("Adjective", 1) || r.is("ProperNoun", 1));
  if (hedge) {
    const h = r.next().raw;
    return c("MarkFuzzy", h, nounPhrase(r, subject, stopAtVerb));
  }
  let first = simpleNounPhrase(r, subject, stopAtVerb);
  // "that plus 3", "it times 2": an operator after a pointing word works on what it points at.
  if (isCall(first) && first.head === "Ref" && INFIX[r.word()] && (r.is("Value", 1) || NUMBER_WORD.test(r.word(1)))) {
    first = c(INFIX[r.next().word], first, nounPhrase(r));
  }
  // "the weights, er the scores", "3, er, 4pm": the speaker takes back their own word.
  while (r.toks[r.i - 1]?.comma && /^(er|erm|um|uh|sorry)$/.test(r.word()) || (r.toks[r.i - 1]?.comma && r.word() === "i" && r.word(1) === "mean")) {
    if (r.next().word === "i") r.next();
    first = c("MarkCorrection", first, nounPhrase(r, subject, stopAtVerb));
  }
  if (r.word() === "or" && r.word(1) === "whatever") {
    r.next();
    r.next();
    return c("MarkFuzzy", "or whatever", first);
  }
  if (r.word() === "or" && !r.is("Verb", 1)) {
    r.next();
    return c("Or", first, nounPhrase(r, subject, stopAtVerb));
  }
  return first;
}

function simpleNounPhrase(r: Reader, subject: boolean, stopAtVerb: boolean): Expr {
  // "the second one", "the other one", "the blue one": a pointing phrase, kept verbatim.
  if (r.word() === "the") {
    let k = 1;
    while (ORDINAL.test(r.word(k)) || (r.is("Adjective", k) && r.word(k) !== "one")) k += 1;
    if (k > 1 && /^ones?$/.test(r.word(k))) return c("Ref", Array.from({ length: k + 1 }, () => r.next().raw).join(" "));
  }
  // "the same thing", "the other file", "the usual": definite descriptions that point.
  if (r.word() === "the" && (r.word(1) === "same" || r.word(1) === "other") && r.is("Noun", 2)) {
    const words = [r.next().raw, r.next().raw, r.next().raw];
    return c("Ref", words.join(" "));
  }
  if (r.word() === "the" && r.word(1) === "usual") {
    const words = [r.next().raw, r.next().raw];
    return c("Ref", words.join(" "));
  }
  if (POINTING.has(r.word()) && r.word(1) === "one") {
    const words = [r.next().raw, r.next().raw];
    return c("Ref", words.join(" "));
  }
  // The phrase that ends a line introducing a block ("fix this bug:") is the block.
  if (pointAt && (POINTING.has(r.word()) || POSSESSIVE[r.word()]) && endsHere(r)) {
    const words = r.toks.slice(r.i).map((x) => x.raw);
    r.i = r.toks.length;
    return c("Ref", words.join(" "), { variable: pointAt });
  }
  // "those logs", "this article", "that bug we talked about last week": a thing pointed at,
  // kept verbatim for memory to resolve, with anything said about it that follows.
  if (/^(that|this|those|these)$/.test(r.word()) && (r.is("Noun", 1) || (r.is("Adjective", 1) && r.is("Noun", 2))) && !r.is("Pronoun", 1)) {
    const words = [r.next().raw];
    while (r.peek() && (r.is("Noun") || r.is("Adjective")) && !r.is("Pronoun") && !PREP.has(r.word()) && !COPULA.has(r.word())) words.push(r.next().raw);
    // "... we talked about last week": the rest of the clause belongs to the phrase.
    if (PERSON[r.word()] && r.word() !== "it" && (r.is("Verb", 1) || r.is("PastTense", 1))) while (!r.done() && !clauseBoundary(r)) words.push(r.next().raw);
    return mention(c("Ref", words.join(" ")));
  }
  // A single letter asked about: "how many r's" is the letter r.
  if (/^[a-z]('s)?$/.test(r.word()) && !PERSON[r.word()] && r.word() !== "a") return r.next().word.replace(/'s$/, "");
  // "that" is an article only before a noun ("that bug"), never before a bare describer.
  while (DET.has(r.word()) && !(POINTING.has(r.word()) && !r.is("Noun", 1) && !(r.is("Adjective", 1) && r.is("Noun", 2)))) r.next();
  // "a like CLAUDE.md": "like" after a determiner can only be a hedge on the thing.
  if (r.word() === "like" && DET.has(r.toks[r.i - 1]?.word ?? "")) {
    r.next();
    return c("MarkFuzzy", "like", simpleNounPhrase(r, subject, stopAtVerb));
  }

  const t = r.peek() ?? fail("expected a noun phrase");
  // "today is ____": a blank left to fill is a hole.
  if (/^_{2,}$/.test(t.raw) || t.word === "blank") {
    r.next();
    return c("What");
  }
  // Verbatim spans cut out before tagging: code, links and quotes are not meant to be understood.
  const span = /^verbatim(\d+)$/.exec(t.word);
  if (span) {
    r.next();
    return spans[Number(span[1])];
  }
  if (POINTING.has(t.word)) {
    r.next();
    // "it" is the ambient it only when the clause is about time or weather: "it is late",
    // "will it be in 5 days", "what time is it". Otherwise it points at something.
    if (t.word === "it" && subject && ambient(r)) return c("It");
    if (t.word === "it" && mentions.length) return c("Ref", t.word, { variable: mentions[mentions.length - 1] });
    return c("Ref", t.word);
  }
  if (PERSON[t.word]) {
    r.next();
    return stressed(t, c(PERSON[t.word]));
  }
  const owner = POSSESSIVE[t.word];
  if (owner) {
    r.next();
    return wrap(owner, nounPhrase(r));
  }
  // Identifiers and paths are not meant to be understood: getUser, src/, config.ts.
  if (/[A-Z]/.test(t.raw.slice(1)) && /[a-z]/.test(t.raw) || /[/\\]|\.[a-z]{1,4}$/.test(t.raw)) {
    r.next();
    return t.raw;
  }
  if (/^\d+(\.\d+)?%$/.test(t.word)) {
    r.next();
    const pct = c("Percent", Number(t.word.slice(0, -1)));
    // "5% a year": the article after a rate is "per".
    if ((r.word() === "a" || r.word() === "an" || r.word() === "per") && (r.is("Date", 1) || r.is("Duration", 1) || /^(year|month|week|day|hour|minute)$/.test(r.word(1)))) {
      r.next();
      return c("At", pct, c("Per", c(name(r.next().word))));
    }
    return pct;
  }
  const time = clock(t.word);
  if (time) {
    r.next();
    return time;
  }
  if (t.tags.has("Value") || NUMBER_WORD.test(t.word)) {
    r.next();
    // "the first batch", "the 21st": an ordinal is a position, in the words typed, like a number.
    const n = t.tags.has("Ordinal") ? c("Ordinal", /^\d/.test(t.word) ? parseInt(t.word, 10) : t.word) :
      /^\d+(\.\d+)?$/.test(t.word) ? Number(t.word) : c("Number", t.word);
    // "17 times 4": an operator between two values, verb first because a number is never a head.
    // "5 time 17": between two numbers, "time" can only be "times" mistyped.
    const op = INFIX[r.word()] ?? (r.word() === "time" ? "Times" : undefined);
    if (op && (r.is("Value", 1) || NUMBER_WORD.test(r.word(1)))) {
      const said = r.next().word;
      const e = c(op, n, nounPhrase(r));
      return said === "time" ? c("MarkMisspelling", said, e) : e;
    }
    // An amount is its unit around its number: "5 days" is Days(5).
    if (!t.comma && r.is("Noun") && !r.is("Pronoun") && !INFIX[r.word()] && !clock(r.word()) && !/^(er|erm|um|uh|sorry)$/.test(r.word())) {
      const amount = c(name(r.next().word), n, ...prepositions(r, true));
      // "two days ago": the amount is how far back.
      if (r.word() === "ago") {
        r.next();
        return c("Ago", amount);
      }
      // "12 hour format", "a 5 star hotel": an amount before a noun describes it.
      if (r.is("Noun") && !r.is("Pronoun") && !r.is("Date") && !PREP.has(r.word()) && !COPULA.has(r.word())) return c(name(r.next().word), amount);
      return amount;
    }
    // "2, 4 and 9": values said side by side are a List.
    const more: Expr[] = [];
    while ((t.comma || r.toks[r.i - 1]?.comma || r.word() === "and") && (r.is("Value", r.word() === "and" ? 1 : 0))) {
      if (r.word() === "and") r.next();
      const v = r.next();
      more.push(/^\d+(\.\d+)?$/.test(v.word) ? Number(v.word) : c("Number", v.word));
    }
    return more.length ? c("List", n, ...more) : n;
  }

  // "no one", "every one": a quantifier and "one" are a person, like "nobody".
  if (QUANTIFIER.has(t.word) && r.word(1) === "one" && !r.is("Noun", 2) && !r.is("Adjective", 2)) {
    r.next();
    r.next();
    return c(name(t.word + " one"));
  }
  if (QUANTIFIER.has(t.word) && !r.is("Pronoun")) {
    r.next();
    return wrap(name(t.word), nounPhrase(r, subject, stopAtVerb));
  }
  if (t.word === "not") {
    r.next();
    return c("Not", nounPhrase(r));
  }
  const describers: Tok[] = [];
  while ((r.is("Adjective") || (r.is("Adverb") && r.is("Adjective", 1))) && !COPULA.has(r.word()) && !(r.word(1) === "than")) describers.push(r.next());
  // "bigger than the other one": a comparative and its "than" name one relation.
  if ((r.is("Adjective") || /^(more|less|fewer)$/.test(r.word())) && r.word(1) === "than") {
    const adj = r.next().word;
    r.next();
    // "bigger than before", "more than ever": what it is measured against may be a time word.
    const against = r.is("Noun") || DET.has(r.word()) || POINTING.has(r.word()) || r.is("Value") ? nounPhrase(r) : c(name(r.next().word));
    return c(name(adj) + "Than", against);
  }
  const nouns: Tok[] = [];
  const afterDet = DET.has(r.toks[r.i - 1]?.word ?? "") || PREP.has(r.toks[r.i - 1]?.word ?? "") || POSSESSIVE[r.toks[r.i - 1]?.word ?? ""] !== undefined;
  while (r.peek() && (r.is("Noun") || (r.is("Date") && !r.is("Value")) || r.word() === "lot" || (afterDet && nouns.length === 0 && r.is("Gerund"))) && !r.is("Pronoun") && !r.is("QuestionWord") && !PREP.has(r.word()) && !COPULA.has(r.word()) && !/^verbatim\d+$/.test(r.word())) {
    // "the weather tomorrow": a date word names a time, not part of the kind before it.
    if (nouns.length && r.is("Date") && !nouns[nouns.length - 1].tags.has("Date")) break;
    // "apples, pears": a comma ends the thing named; the next noun is a sibling.
    if (nouns.length && nouns[nouns.length - 1].comma) break;
    // "is greg my coworker": the tagger calls "my" a noun, but an owner opens a new phrase.
    if (nouns.length && POSSESSIVE[r.word()]) break;
    // "sister's birthday": an owning noun wraps what it owns.
    if (r.is("Possessive") && nouns.length === 0 && r.is("Noun", 1)) {
      const owner = r.next();
      return stressed(owner, wrap(name(owner.word.replace(/'s$/, "")), nounPhrase(r)));
    }
    nouns.push(r.next());
  }
  // "sept 20", "chapter 3", "a pi 4": a noun and the number that picks one out.
  if (nouns.length && r.is("Value") && /^\d+$/.test(r.word()) && !r.is("Noun", 1)) {
    const kind = nouns.map((n) => name(n.word)).join("");
    return c(kind, Number(r.next().word));
  }
  // After a helper, "the build go": the last word is the verb the helper carries.
  if (stopAtVerb && nouns.length > 1 && canBeVerb(nouns[nouns.length - 1].word) && !knownName(nouns.map((n) => n.word).join(" "))) {
    r.i -= 1;
    nouns.pop();
  }
  // "every dog barks", "the build fails": a singular subject agrees with an -s verb, so with
  // no other verb after, that last word is the verb, not part of the thing.
  const verbAfter = r.is("Verb") || COPULA.has(r.word()) || AUX.has(r.word());
  const agreeing = nouns[nouns.length - 1];
  if (subject && !verbAfter && nouns.length > 1 && /[^s]s$/.test(agreeing.word) && canBeVerb(agreeing.word.slice(0, -1)) && !nouns[nouns.length - 2].tags.has("Plural")) {
    r.i -= 1;
    nouns.pop();
    agreeing.tags.add("Verb");
  }
  // A word the tagger could not place, after an owner or a determiner, is a thing: "my ex".
  if (!nouns.length && !describers.length && r.peek() && /^[a-z]+$/.test(r.word()) && (!r.is("Verb") || PREP.has(r.toks[r.i - 1]?.word ?? "")) && !PREP.has(r.word()) && !COPULA.has(r.word()) && !AUX.has(r.word()) && !/^(and|or|but|if|then|so)$/.test(r.word())) nouns.push(r.next());
  // "open 24/7", "a quick `grep`": what is described is the verbatim span itself.
  const kept = !nouns.length && describers.length ? /^verbatim(\d+)$/.exec(r.word()) : null;
  if (kept) {
    r.next();
    return describers.reduceRight<Expr>((inner, d) => stressed(d, c(name(d.word), inner)), spans[Number(kept[1])]);
  }
  if (!nouns.length) {
    if (describers.length) return describers.reduceRight<Expr>((inner, d) => c(name(d.word), inner), c(name(describers.pop()!.word)));
    fail(`expected a noun at "${r.word()}"`);
  }
  // Nouns side by side: one kind of thing when Wikidata names the phrase ("cover letter" is
  // CoverLetter), otherwise the last is the thing and the ones before describe it
  // ("barista job" is Job(Barista())).
  // "new years day": a describing word the graph knows as part of one name is part of the
  // name, not a description of it. Only a name the graph already holds, so nothing is asked.
  while (describers.length && nouns.length && knownName([describers[describers.length - 1], ...nouns].map((n) => n.word).join(" "))) {
    nouns.unshift(describers.pop()!);
  }
  const last = nouns[nouns.length - 1];
  const phrase = nouns.map((n) => n.word).join(" ");
  const oneThing = nouns.length === 1 || namesOneThing(phrase) === true;
  const kind = oneThing ? nouns.map(named).join("") : named(last);
  const modifiers = oneThing ? [] : nouns.slice(0, -1).map((n) => spelled(n, c(named(n))));
  let core: Expr = stressed(last, spelled(last, c(kind, ...modifiers, ...prepositions(r, true), ...relative(r), ...reducedRelative(r))));
  for (const d of [...describers].reverse()) core = stressed(d, wrap(name(d.word), core));
  return core;
}

/** The clause around this "it" speaks of time or weather, so the "it" is the situation itself. */
function ambient(r: Reader): boolean {
  const words = r.toks.map((x) => x.word);
  return r.toks.some((x) => x.tags.has("Date") || x.tags.has("Time") || x.tags.has("Duration")) ||
    words.some((w) => /^(time|day|late|early|rain|raining|rains|snow|snowing|sunny|cold|hot|warm|dark|light|tuesday|monday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|night|morning|noon|midnight|days|hours|minutes|weeks|years)$/.test(w));
}

/** Pointing phrases met earlier in this message, bound so a later "it" can point at them. */
let mentions: string[] = [];
let bindings: string[] = [];
function mention(ref: Expr): Expr {
  if (!bindMentions) return ref;
  const v = `ref${mentions.length + 1}`;
  mentions.push(v);
  bindings.push(`$${v} = ${format(ref)}`);
  return { variable: v };
}
/** Only a message of several sentences can point back at its own phrase. */
let bindMentions = false;

/** Whether the phrase starting here runs to the end of the clause: a determiner, then nouns. */
function endsHere(r: Reader): boolean {
  const rest = r.toks.slice(r.i + 1);
  return rest.length > 0 && rest.length <= 3 && rest.every((x) => x.tags.has("Noun") || x.tags.has("Adjective"));
}

/** Words corrected before tagging in the sentence being read: meant -> as typed. */
let typed = new Map<string, string>();
/** The misspelling kept around the Concept it meant: MarkMisspelling("wether", Weather()). */
const spelled = (t: Tok, e: Expr): Expr => (typed.has(t.word) ? c("MarkMisspelling", typed.get(t.word)!, e) : e);

/** Verbatim spans of the message being read, by the index their token carries. */
let spans: Expr[] = [];
/** The block the current line introduces, when it ends in ":" before a fence. */
let pointAt: string | undefined;

/**
 * Prepositional phrases, each wrapping what it governs: In(Pittsburgh()), Of(Pin()). A noun
 * keeps only "of" ("the head of a pin"); every other phrase belongs to the verb, so "set an
 * alarm for 7am" is Set(Alarm(), For(Time(7, Am()))).
 */
function prepositions(r: Reader, ofOnly = false): Expr[] {
  const out: Expr[] = [];
  while (PREP.has(r.word()) && (!ofOnly || r.word() === "of") && !(r.word() === "to" && r.is("Verb", 1) && !r.is("Noun", 1))) {
    const p = r.next();
    out.push(c(name(p.word), nounPhrase(r)));
  }
  return out;
}

/** "a function that parses csv": a relative clause belongs to its noun, That(Parses(Csv())). */
function relative(r: Reader): Expr[] {
  if ((r.word() === "that" || r.word() === "which" || r.word() === "who") && (r.is("Verb", 1) || canBeVerb(r.word(1))) && !r.is("Noun", 1)) {
    const rel = r.next();
    return [c(name(rel.word), toComma(r, verbPhrase))];
  }
  return [];
}

/** "everything i told you", "the files i sent": a relative clause with no "that". */
function reducedRelative(r: Reader): Expr[] {
  if (PERSON[r.word()] && r.word() !== "it" && (r.is("Verb", 1) || r.is("PastTense", 1)) && !COPULA.has(r.word(1))) {
    const who = c(PERSON[r.next().word]);
    return [inside(who, toComma(r, verbPhrase))];
  }
  return [];
}

/** Parse with the reader cut at the next comma: "the files i sent, not the first one" ends the clause at "sent". */
function toComma<T>(r: Reader, parse: (r: Reader) => T): T {
  const end = r.toks.findIndex((t, k) => k >= r.i && t.comma);
  if (end < 0) return parse(r);
  const cut = new Reader(r.toks.slice(0, end + 1));
  cut.i = r.i;
  const out = parse(cut);
  r.i = cut.i;
  return out;
}

/** Everything after a verb, as its arguments in the order said. */
function complements(r: Reader, stop: (r: Reader) => boolean = () => false): Expr[] {
  const out: Expr[] = [];
  while (!r.done() && !stop(r) && !clauseBoundary(r)) {
    const w = r.word();
    if (w === "and") {
      r.next();
      continue;
    }
    if (w === "please") {
      r.next();
      continue;
    }
    // "have a million dollars or owe a million dollars": alternatives between two doings.
    if (w === "or" && out.length && canBeVerb(r.word(1)) && !r.is("Noun", 1)) {
      r.next();
      out.push(c("Or", out.pop()!, verbPhrase(r)));
      continue;
    }
    // "and like think": a filler "like" before a doing blurs it.
    if (w === "like" && (r.is("Verb", 1) || canBeVerb(r.word(1))) && !r.is("Noun", 1) && !DET.has(r.word(1))) {
      const h = r.next().raw;
      out.push(c("MarkFuzzy", h, verbPhrase(r)));
      continue;
    }
    // Filler inside or after a clause is kept as said, beside it.
    if (/^(lol|lmao|idk|btw|tbh|imo|haha)$/.test(w)) {
      trailing.push(r.next().raw);
      continue;
    }
    // "3, er, 4pm", "the size, sorry the length": a retraction of one's own words.
    if (out.length && r.toks[r.i - 1]?.comma && /^(er|um|sorry|no|i mean)$/.test(w)) {
      r.next();
      if (r.word() === "wait") r.next();
      const retracted = out.pop()!;
      out.push(c("MarkCorrection", retracted, nounPhrase(r)));
      continue;
    }
    if (r.is("Particle") || (PARTICLE.has(w) && !r.is("Noun", 1) && !r.is("Determiner", 1))) {
      out.push(c(name(r.next().word)));
    } else if (WH.has(w) || w === "whether" || w === "if") {
      // "show me what you know", "tell me whether it will rain": a question inside, as said.
      const q = r.next();
      if (r.done() || clauseBoundary(r)) out.push(c(name(q.word)));
      else out.push(embeddedQuestion(r, q) ?? c(name(q.word), clause(r).e));
    } else if (w === "to" && r.word(1) === "like" && canBeVerb(r.word(2)) && !r.is("Noun", 2)) {
      r.next();
      r.next();
      out.push(c("MarkFuzzy", "like", verbPhrase(r)));
    } else if (w === "to" && (r.is("Verb", 1) || (canBeVerb(r.word(1)) && (DET.has(r.word(2)) || POSSESSIVE[r.word(2)] || r.is("Noun", 2))))) {
      r.next();
      out.push(verbPhrase(r));
    } else if (PREP.has(w)) {
      out.push(...prepositions(r));
    } else if ((r.is("Adverb") || r.is("Date") && !r.is("Value")) && r.word(1) !== "than") {
      out.push(stressed(r.peek()!, c(name(r.next().word))));
    } else if (r.is("Verb") && !r.is("Noun")) {
      out.push(verbPhrase(r));
    } else {
      const np = nounPhrase(r);
      // "add 2 and 2": two things side by side are siblings; three or more are a List.
      const pair = typeof np === "object" && np !== null && "head" in np && np.head === "List" && np.args.length === 2;
      if (pair) out.push(...np.args.map((a) => a.value));
      else out.push(np);
    }
  }
  return out;
}

/** Filler met inside the clause being read, written after it as an aside. */
let trailing: string[] = [];
/** Reading the condition of an "if". */
let inCondition = false;

/** A new clause starts at "then", or at "and" followed by a subject and a verb. */
function clauseBoundary(r: Reader): boolean {
  if (r.word() === "then" || r.word() === "otherwise") return true;
  // "you're not wrong but can you do the math": "but" joins two clauses, kept around the second.
  if (/^(but|so|because|unless|although|though|since|or)$/.test(r.word()) && (AUX.has(r.word(1)) || PERSON[r.word(1)] || r.word(1) === "that" || r.word(1) === "it" || (canBeVerb(r.word(1)) && r.word() !== "or"))) return true;
  // Inside a condition, an order ends it: "if it is after noon tell me the time".
  if (inCondition && r.i > 1 && canBeVerb(r.word()) && !r.is("Noun") && (PERSON[r.word(1)] || DET.has(r.word(1)) || POSSESSIVE[r.word(1)])) return true;
  // ", it's really long": a comma before a subject and its verb starts a new clause.
  if (r.toks[r.i - 1]?.comma && (PERSON[r.word()] || r.word() === "it") && (r.is("Verb", 1) || COPULA.has(r.word(1)))) return true;
  // "take 10, double it": a comma before a verb starts the next clause.
  const before = r.toks[r.i - 1];
  if (before?.comma && (r.is("Verb") || r.word() === "then" || AUX.has(r.word()) || WH.has(r.word()))) return true;
  if (r.word() === "and" && (PERSON[r.word(1)] || r.word(1) === "it") && (r.is("Verb", 2) || COPULA.has(r.word(2)))) return true;
  // "what day is it and what time is it": a question word after "and" asks a second question.
  if (r.word() === "and" && WH.has(r.word(1)) && r.i + 2 < r.toks.length) return true;
  // "and update the tests", "and tell me": an order joined on, recognised by what follows it.
  if (r.word() === "and" && canBeVerb(r.word(1)) && (DET.has(r.word(2)) || POSSESSIVE[r.word(2)] || PERSON[r.word(2)] || POINTING.has(r.word(2)))) return true;
  // "and like add them up": a hedge before the verb of a new order.
  // "and say if it is bigger": a verb that takes a question after it.
  if (r.word() === "and" && canBeVerb(r.word(1)) && !r.is("Noun", 1) && (WH.has(r.word(2)) || /^(if|whether)$/.test(r.word(2)))) return true;
  if (r.word() === "and" && r.word(1) === "like" && canBeVerb(r.word(2)) && (DET.has(r.word(3)) || PERSON[r.word(3)] || POINTING.has(r.word(3)))) return true;
  return false;
}

function verbPhrase(r: Reader): Expr {
  // "have not been there", "did not finish": a helper and its "not" are one fixed name.
  if (AUX.has(r.word()) && r.word(1) === "not") {
    const aux = r.next();
    const not = r.next();
    const rest = r.is("Verb") || canBeVerb(r.word()) ? [verbPhrase(r)] : complements(r);
    return stressed(not, stressed(aux, c(name(aux.word) + "Not", ...rest)));
  }
  const v = r.next();
  if (!v.tags.has("Verb") && !v.tags.has("Infinitive") && !canBeVerb(v.word)) fail(`expected a verb at "${v.word}"`);
  // "says hello world": what is said is quoted, not understood.
  if (SAYING.has(v.word) && !r.done() && !PERSON[r.word()] && !DET.has(r.word()) && !PREP.has(r.word()) && !WH.has(r.word()) && r.word() !== "if" && r.word() !== "whether") {
    const words: Tok[] = [];
    while (!r.done() && !clauseBoundary(r)) words.push(r.next());
    // "says "hello world"": a quoted span is what is said, and the rest stays around it.
    const quoted = words.map((w) => /^verbatim(\d+)$/.exec(w.word)).filter(Boolean);
    if (quoted.length === 1 && words.length === 1) return c(name(v.word), spans[Number(quoted[0]![1])]);
    const text = words.map((w) => { const m = /^verbatim(\d+)$/.exec(w.word); return m ? String(spans[Number(m[1])]) : w.raw; }).join(" ");
    return c(name(v.word), text);
  }
  // "figure out what", "look up the word", "give up": a verb and the particle right after it
  // are one verb, the way "figure out" is not figuring plus out.
  if (!r.done() && (r.is("Particle") || (PARTICLE.has(r.word()) && !r.is("Noun", 1) && !r.is("Determiner", 1)))) {
    const particle = r.next();
    return stressed(v, spelled(v, c(name(v.word) + name(particle.word), ...complements(r))));
  }
  return stressed(v, spelled(v, c(name(v.word), ...complements(r))));
}

/** "don't X" and "do not X": one fixed combination, DoNot. */
function negatedOrder(r: Reader): Expr | undefined {
  if ((r.word() === "do" && r.word(1) === "not") || r.word() === "don't") {
    const start = r.next();
    const not = r.word() === "not" ? r.next() : start;
    return stressed(not, c("DoNot", verbPhrase(r)));
  }
  return undefined;
}

function order(r: Reader): Expr {
  let polite = false;
  if (r.word() === "please") {
    r.next();
    polite = true;
  }
  const body = negatedOrder(r) ?? verbPhrase(r);
  polite ||= r.toks.some((t) => t.word === "please");
  return polite ? c("Please", body) : body;
}

/** A question led by its question word. */
function whQuestion(r: Reader): Expr {
  const wh = r.next().word;
  let head = name(wh);
  if (r.done()) return c(head);
  if (wh === "how" && (r.word() === "many" || r.word() === "much")) head = r.next().word === "many" ? "HowMany" : "HowMuch";

  // "what's", "what is", "who did", "where will": a helper right after fuses with it.
  // HowMany and HowMuch already name what they ask, so a helper after them stays its own.
  if ((AUX.has(r.word()) || COPULA.has(r.word())) && head !== "HowMany" && head !== "HowMuch") {
    const aux = r.next();
    const fused = head + name(aux.word === "'s" ? "is" : aux.word);
    if (r.done()) return c(fused);
    if (r.word() === "be" || (r.is("Verb") && !r.is("Noun") && !PERSON[r.word()] && !DET.has(r.word()))) return c(fused, verbPhrase(r));
    const subject = nounPhrase(r, true, true);
    // "what is the weather in pittsburgh": with no verb, a phrase after the subject is part of it.
    if (COPULA.has(aux.word) && PREP.has(r.word())) {
      const pps = prepositions(r);
      return c(fused, attach(subject, pps), ...complements(r));
    }
    // "what do i like": one word left is the verb, whatever else the tagger thought it
    // could be ("like" is also a preposition, and read as one it had no object).
    if (r.i === r.toks.length - 1 && /^[a-z]+$/.test(r.word())) return c(fused, subject, c(name(r.next().word)));
    const rest = complements(r);
    return c(fused, subject, ...rest);
  }
  // "what time will it be", "which file did you open": a word before a helper is what is
  // asked about, whatever the tagger thought ("time" is not an order here).
  if (!AUX.has(r.word()) && AUX.has(r.word(1)) && /^[a-z]+$/.test(r.word())) {
    const asked = c(name(r.next().word));
    const aux = r.next();
    if (r.is("Verb") && !r.is("Noun") && !PERSON[r.word()]) return c(head, asked, c(name(aux.word), verbPhrase(r)));
    const subject = nounPhrase(r, true, true);
    return c(head, asked, c(name(aux.word), subject, ...complements(r)));
  }
  // "who wrote hamlet": the question word is the subject.
  if (r.is("Verb") && !r.is("Noun")) return c(head, verbPhrase(r));
  // "what day will it be ...", "how many angels can dance ...": what is asked about, then the rest.
  const asked = r.is("Adjective") ? c(name(r.next().word)) : nounPhrase(r);
  if (r.done()) return c(head, asked);
  if (PREP.has(r.word())) return c(head, asked, ...complements(r));
  if ((head === "HowMany" || head === "HowMuch") && AUX.has(r.word()) && (PERSON[r.word(1)] || DET.has(r.word(1)))) {
    const aux = r.next();
    const subject = nounPhrase(r, true, true);
    return c(head, c(name(aux.word), subject, ...complements(r)));
  }
  if (AUX.has(r.word())) {
    const aux = r.next();
    if (PREP.has(r.word())) return c(head, asked, c(name(aux.word), ...complements(r)));
    if (r.is("Verb") && !r.is("Noun")) return c(head, asked, c(name(aux.word), verbPhrase(r)));
    const subject = nounPhrase(r, true, true);
    const rest = complements(r);
    return c(head, asked, c(name(aux.word), subject, ...rest));
  }
  return c(head, asked, verbPhrase(r));
}

/** A yes/no question led by its helper: Could(You(), Close(Door())), Is(Chess(), Sport()). */
function helperQuestion(r: Reader): Expr {
  const aux = r.next();
  const subject = nounPhrase(r, true, true);
  if (r.done()) return c(name(aux.word), subject);
  // "could you please summarize this": the polite word stays, around what it asks.
  const polite = r.word() === "please";
  if (polite) r.next();
  const rest = r.is("Verb") && !r.is("Noun") ? [verbPhrase(r)] : complements(r);
  const asked = polite && rest.length === 1 ? [c("Please", rest[0])] : rest;
  return stressed(aux, c(name(aux.word), subject, ...asked));
}

/** A claim: the thing first, its predicate inside it, unless the subject cannot be a head. */
function claim(r: Reader): { e: Expr; fragment?: true } {
  const subject = nounPhrase(r, true);
  const canHead = typeof subject === "object" && subject !== null && "head" in subject && subject.head !== "Ref";
  // "you specifically stated it", "i really like it": an adverb before the verb wraps it.
  const adverbs: Tok[] = [];
  while (r.is("Adverb") && !COPULA.has(r.word()) && (r.is("Verb", 1) || r.is("PastTense", 1) || (r.is("Adverb", 1) && r.is("Verb", 2)))) adverbs.push(r.next());
  let predicate: Expr;
  if (adverbs.length) {
    predicate = adverbs.reduceRight<Expr>((inner, a) => stressed(a, spelled(a, c(name(a.word), inner))), verbPhrase(r));
  } else if (COPULA.has(r.word())) {
    const cop = r.next();
    if (r.word() === "a" || r.word() === "an") {
      r.next();
      predicate = c("IsA", nounPhrase(r));
    } else if (r.is("Adjective") && PREP.has(r.word(1))) {
      // "allergic to peanuts": a describing word and its preposition name one relation.
      const adj = r.next().word;
      const prep = r.next().word;
      predicate = c(name(adj) + name(prep), nounPhrase(r));
    } else {
      predicate = c(name(cop.word === "'m" || cop.word === "am" ? "am" : cop.word === "'s" ? "is" : cop.word), ...complements(r));
    }
  } else if (r.is("Verb") || r.is("Modal")) {
    predicate = verbPhrase(r);
  } else if (r.done() || clauseBoundary(r) || r.toks[r.i - 1]?.comma || (typeof subject === "object" && subject !== null && "head" in subject && subject.head === "Not" && DET.has(r.word()))) {
    // A fragment: a thing named and nothing said about it ("banana", "and germany?"), ended
    // by the message or a comma ("not that one, the blue one").
    return { e: subject, fragment: true };
  } else {
    return fail(`no verb after the subject, at "${r.word()}"`);
  }
  if (!canHead) {
    const p = predicate as { head: string; args: { value: Expr }[] };
    return { e: c(p.head, subject, ...p.args.map((a) => a.value)) };
  }
  return { e: inside(subject, predicate) };
}

/** Arguments added to the thing a phrase names, through owners, describers and a misspelling. */
function attach(np: Expr, extra: Expr[]): Expr {
  if (!extra.length || typeof np !== "object" || np === null || !("head" in np)) return np;
  if (np.head === "MarkMisspelling" && np.args.length === 2) return c("MarkMisspelling", np.args[0].value, attach(np.args[1].value, extra));
  if (WRAPPERS.has(np as object) && np.args.length === 1) return c(np.head, attach(np.args[0].value, extra));
  return c(np.head, ...np.args.map((a) => a.value), ...extra);
}

/**
 * The predicate goes inside the innermost thing the subject names, through owners and
 * describers: My(Dad(IsA(Doctor()))), Old(Car(Broke())). A wrapper is a call whose only
 * argument is itself a call; a preposition or a value stops the descent.
 */
function inside(subject: Expr, predicate: Expr): Expr {
  const s = subject as { head: string; args: { name?: string; value: Expr }[] };
  if (WRAPPERS.has(s as object) && s.args.length === 1) return c(s.head, inside(s.args[0].value, predicate));
  if (s.head === "MarkMisspelling" && s.args.length === 2) return c(s.head, s.args[0].value, inside(s.args[1].value, predicate));
  return c(s.head, ...s.args.map((a) => a.value), predicate);
}

type Kind = "Interrogative" | "Imperative" | "Declarative" | "Checking";

/** A tag that turns a statement into a check: "it's tuesday, right?". */
const TAG = /,\s*(right|no|yeah|yes|ok|okay|correct|huh)\s*\?+\s*$/i;

/**
 * One line per clause: clauses split at "then", at commas before a verb, and at "and" + clause.
 * Each line carries its mood, which the rules know from the clause they built, so nothing
 * has to guess it from the surface afterwards (`design/reading-spec.md` Part 4.3). A tag is
 * its own line; "!" and "??" stress the sentence.
 */
function sentence(text: string): Expr[] {
  const trimmed = text.trim();
  const tag = TAG.exec(trimmed);
  const body = tag ? trimmed.slice(0, tag.index) : trimmed;
  const asked = /\?\s*$/.test(trimmed);
  const marks = /(!+|\?\?+)\s*$/.exec(trimmed)?.[1];
  const lines = clauses(body);
  const out = lines.map(({ e, kind }, i) => {
    // "maybe tuesday?", "and germany?": a fragment asked is put forward to be confirmed.
    const aside = typeof e === "object" && e !== null && "head" in e && e.head === "MarkAside";
    if (!kind && asked && i === lines.length - 1 && !aside) kind = "Checking";
    if (!kind) return e;
    const k: Kind = kind !== "Interrogative" && (asked || tag) ? "Checking" : kind;
    return c("Mood", c(k), marks ? c("MarkEmphasis", marks, e) : e);
  }).map((e, i) => (marks && !lines[i].kind ? c("MarkEmphasis", marks, e) : e));
  if (tag) out.push(c(name(tag[1])));
  return out;
}

function clauses(text: string): { e: Expr; kind?: Kind }[] {
  const fixed = correct(expandBare(text.replace(/[?.!]+\s*$/, "")));
  typed = fixed.typed;
  trailing = [];
  const toks = tokens(fixed.text);
  if (!toks.length) fail("empty");
  const out: { e: Expr; kind?: Kind }[] = [];
  const r = new Reader(toks);
  // A whole message that is one fixed phrase is one name (reading-spec P4): its words do
  // not mean themselves. "good morning" is a greeting, not a claim that the morning is good.
  const words = (from: number, to: number) => toks.slice(from, to).map((t) => t.word).join(" ").replace(/\s*'s\b/g, "s");
  const phrase = FIXED[words(0, toks.length)];
  if (phrase) return [{ e: phrase }];
  // "good morning, what time is it": the phrase before the first comma, then the rest.
  const comma = toks.findIndex((t) => t.comma);
  if (comma >= 0 && FIXED[words(0, comma + 1)]) {
    out.push({ e: FIXED[words(0, comma + 1)] });
    r.i = comma + 1;
  }
  // "hey there" is one fixed phrase; other leading filler is kept verbatim as an aside.
  if (r.word() === "hey" && r.word(1) === "there") {
    r.next();
    r.next();
    out.push({ e: c("HeyThere") });
  }
  for (;;) {
    const filler: string[] = [];
    // "like isn't who already...": a leading "like" before a clause is filler, not a hedge.
    // "yo homie can you...", "dude where is it": who is spoken to, before the clause, is an aside.
    // A response that is the whole message ("hi", "lol") is said, not filler around something.
    const alone = () => r.i === r.toks.length - 1 && responds(r.word());
    while ((isFiller(r.word()) && !alone() && !(r.word() === "now" && r.is("Verb", 1) === false && r.done())) || ((r.word() === "like" || VOCATIVE.test(r.word())) && opensClause(r, 1))) filler.push(r.next().raw);
    if (filler.length) out.push({ e: c("MarkAside", filler.join(" ")) });
    // "yeah keep going", "sorry what did i agree to": a response said before the clause is its own line.
    const politeOnly = r.toks.length - r.i === 2 && /^(please|pls|plz|thanks|thx)$/.test(r.word(1));
    if (!r.done() && !politeOnly && responds(r.word()) && r.i + 1 < r.toks.length && (r.peek()!.comma || opensClause(r, 1))) {
      const said = r.next();
      out.push({ e: stressed(said, c(name(said.word))) });
      continue;
    }
    break;
  }
  while (!r.done()) {
    while (r.word() === "then" || r.word() === "and" || r.word() === ",") r.next();
    if (r.done()) break;
    const at = r.i;
    try {
      if (clauseAt(r, out) === "stop") break;
    } catch (error) {
      if (!(error instanceof Unparsed)) throw error;
      // A clause that read fine and then had words left over keeps what it read.
      if (error.leftAt !== undefined && error.leftAt > at + 1) {
        const cut = new Reader(r.toks.slice(0, error.leftAt));
        cut.i = at;
        try {
          out.push(clause(cut));
          r.i = cut.i;
          continue;
        } catch (again) {
          if (!(again instanceof Unparsed)) throw again;
        }
      }
      // Words the rules cannot read are kept as they were said, up to where a clause can start again.
      r.i = at;
      // Kept as typed, before any spelling correction.
      const asTyped = (t: Tok) => typed.get(t.word) ?? t.raw;
      const skipped = [asTyped(r.next())];
      while (!r.done() && !resumes(r)) skipped.push(asTyped(r.next()));
      // Unreadable words next to each other are one span.
      const last = out[out.length - 1];
      const joins = last && unread.length && typeof last.e === "object" && last.e !== null && "head" in last.e && last.e.head === "Unclear";
      const words = joins ? `${unread.pop()} ${skipped.join(" ")}` : skipped.join(" ");
      unread.push(words);
      const e = unclearSpan(words);
      if (joins) out[out.length - 1] = { e };
      else out.push({ e });
    }
  }
  return out;
}

/**
 * "figure out what 17 times 3 is", "tell me where the station is": inside a sentence the
 * question keeps statement order, and means what "what is 17 times 3" means, so it is
 * written the same way, WhatIs(Times(17, 3)).
 */
function embeddedQuestion(r: Reader, q: Tok): Expr | undefined {
  if (!WH.has(q.word)) return undefined;
  const at = r.i;
  try {
    const subject = nounPhrase(r, true);
    if (COPULA.has(r.word()) && (r.i + 1 >= r.toks.length || clauseBoundary(new Reader(r.toks.slice(r.i + 1))))) {
      const cop = r.next().word;
      return c(name(q.word) + name(cop === "'s" ? "is" : cop), subject);
    }
  } catch (error) {
    if (!(error instanceof Unparsed)) throw error;
  }
  r.i = at;
  return undefined;
}

/**
 * Words the rules could not arrange are still words: each is a Concept, in the order said,
 * so what is unknown about them can be learned and described. The verbatim text comes first
 * so the system can say what it did not follow. Nothing in it being a word ("asdkjh") leaves
 * the text alone.
 */
function unclearSpan(words: string): Expr {
  const concepts = (words.toLowerCase().match(/[a-z][a-z']*/g) ?? []).filter(isWord).map((w) => c(name(w)));
  return c("Unclear", words, ...concepts);
}

/** Where reading can start again after words it could not: a comma, a joiner, or a clause opening. */
function resumes(r: Reader): boolean {
  return !!r.toks[r.i - 1]?.comma || /^(and|then|but|so|because|if)$/.test(r.word()) || WH.has(r.word()) || AUX.has(r.word()) ||
    (PERSON[r.word()] !== undefined && (r.is("Verb", 1) || AUX.has(r.word(1)) || COPULA.has(r.word(1))));
}

/** Read one clause at the reader into `out`; "stop" when the message is finished. */
function clauseAt(r: Reader, out: { e: Expr; kind?: Kind }[]): "stop" | undefined {
  // "no, not that one", "yes, do it": the answer is said on its own, then what follows.
  if (ANSWER.test(r.word()) && r.peek()!.comma && r.i + 1 < r.toks.length) {
    const answer = r.next();
    out.push({ e: stressed(answer, c(name(answer.word))) });
    return;
  }
  // "yes please", "no thanks": an answer and its politeness are one fragment.
  if (ANSWER.test(r.word()) && r.toks.length - r.i === 2 && /^(please|pls|plz|thanks|thx)$/.test(r.word(1))) {
    const answer = r.next();
    const polite = r.next();
    out.push({ e: polite.word.startsWith("p") ? c("Please", c(name(answer.word))) : c(name(answer.word), c("Thanks")) });
    return;
  }
  // "but", "so that", "because", "unless", "or": the joiner is kept around the clause it opens.
  // "as long as it works", "even if it rains": a joiner of several words, kept as one.
  const long = [3, 2].find((n) => /^(as long as|as soon as|even though|even if)$/.test(r.toks.slice(r.i, r.i + n).map((t) => t.word).join(" ")));
  if (long && out.length) {
    const joiner = name(r.toks.slice(r.i, r.i + long).map((t) => t.word).join(" "));
    r.i += long;
    const next = clause(r);
    out.push({ e: c(joiner, next.e), ...(next.kind ? { kind: next.kind } : {}) });
    return;
  }
  if (/^(but|so|because|unless|although|though|since|or)$/.test(r.word()) && out.length) {
    let joiner = name(r.next().word);
    if (joiner === "So" && r.word() === "that") joiner = name("so " + r.next().word);
    const next = clause(r);
    out.push({ e: c(joiner, next.e), ...(next.kind ? { kind: next.kind } : {}) });
    return;
  }
  // "and plus 3?", "now times 2", "times that by 2": an operator with nothing said before it
  // works on the last answer. What it works on is a reference nobody put into words,
  // `Ref("")`, which memory resolves the way it resolves "it". Asking for the value, so the
  // mood is a question whatever the punctuation.
  const lead = /^(and|now|then)$/.test(r.word()) && INFIX[r.word(1)] ? 1 : 0;
  if (INFIX[r.word(lead)] && (r.is("Value", lead + 1) || NUMBER_WORD.test(r.word(lead + 1)) || POINTING.has(r.word(lead + 1)))) {
    const at = r.i;
    r.i += lead;
    const op = INFIX[r.next().word];
    try {
      if (POINTING.has(r.word())) {
        const target = nounPhrase(r);
        if (r.word() === "by") r.next();
        out.push({ e: c(op, target, nounPhrase(r)), kind: "Interrogative" });
      } else {
        out.push({ e: c(op, c("Ref", ""), nounPhrase(r)), kind: "Interrogative" });
      }
      if (r.done()) return "stop";
      return;
    } catch (error) {
      if (!(error instanceof Unparsed)) throw error;
      r.i = at;
    }
  }
  // A phrase with no verb at all: "in 12 hour format?", a follow-up to what came before.
  if (PREP.has(r.word()) && r.word() !== "like") {
    const at = r.i;
    try {
      const pp = prepositions(r);
      if (r.done()) {
        out.push({ e: pp.length === 1 ? pp[0] : c("List", ...pp), kind: "Declarative" });
        return "stop";
      }
    } catch (error) {
      if (!(error instanceof Unparsed)) throw error;
    }
    r.i = at;
  }
  // "if A, B", "if A then B", "if A tell me B otherwise tell me C": the condition, then
  // what holds under it; an "otherwise" is kept around what holds when it does not.
  if (r.word() === "if") {
    r.next();
    inCondition = true;
    const condition = clause(r).e;
    inCondition = false;
    while (r.word() === "then" || r.word() === ",") r.next();
    if (r.done()) {
      out.push({ e: c("If", condition), kind: "Declarative" });
      return "stop";
    }
    const main = clause(r);
    const rest: Expr[] = [];
    if (r.word() === "otherwise" || r.word() === "else") {
      r.next();
      rest.push(c("Otherwise", clause(r).e));
    }
    out.push({ e: c("If", condition, main.e, ...rest), ...(main.kind ? { kind: main.kind } : {}) });
    return;
  }
  out.push(clause(r));
  if (trailing.length) {
    out.push({ e: c("MarkAside", trailing.join(" ")) });
    trailing = [];
  }
  return undefined;
}

/**
 * An order starts with a verb. A word the tagger calls both ("compare", "review") opens an
 * order when it can be a verb and is not naming a person, a place or several things.
 */
function opensOrder(r: Reader): boolean {
  const t = r.peek()!;
  if (t.tags.has("Pronoun") || t.tags.has("Determiner") || t.tags.has("Possessive") || t.tags.has("Adjective")) return false;
  // Code and identifiers are named, never ordered: "MoodDo", a pasted span.
  if (/^verbatim\d+$/.test(t.word) || /[a-z][A-Z]/.test(t.raw)) return false;
  if (t.tags.has("Verb") && !t.tags.has("Noun")) return true;
  return canBeVerb(t.word) && !t.tags.has("Plural") && !t.tags.has("ProperNoun") && !t.tags.has("Date") &&
    !r.is("Verb", 1) && !COPULA.has(r.word(1));
}

/** Phrases whose words do not mean themselves, read as one name when they are the whole message. */
const FIXED: Record<string, Expr> = {
  "good morning": c("GoodMorning"),
  "good afternoon": c("GoodAfternoon"),
  "good evening": c("GoodEvening"),
  "good night": c("GoodNight"),
  "whats up": c("WhatsUp"),
  "what is up": c("WhatsUp"),
  sup: c("WhatsUp"),
  "nice to meet you": c("NiceToMeetYou"),
  "thank you so much": c("ThankYou", c("SoMuch")),
  "thank you very much": c("ThankYou", c("VeryMuch")),
  "thanks so much": c("Thanks", c("SoMuch")),
  "thanks a lot": c("Thanks", c("ALot")),
  "see you later": c("SeeYouLater"),
  "see ya": c("SeeYouLater"),
};

/** Words that are a whole utterance on their own: said, not asserted, asked or ordered. */
const INTERJECTION = /^(thanks|thank|thx|ty|hi|hello|hey|sorry|ok|okay|cool|nice|sick|yes|yeah|yep|nope|no|wow|oops|great|awesome|agreed|sure)$/;

function clause(r: Reader): { e: Expr; kind?: Kind } {
  const first = r.peek()!;
  // "cool, thanks": an interjection before a comma is its own fragment too.
  if ((INTERJECTION.test(first.word) || EXPRESSION.has(first.word)) && first.comma && r.toks.length - r.i > 1) {
    r.next();
    return { e: stressed(first, c(name(first.word))) };
  }
  // "thanks", "thank you", "cool": an interjection is a fragment, with no mood.
  if ((INTERJECTION.test(first.word) || EXPRESSION.has(first.word)) && (r.toks.length - r.i === 1 || (first.word === "thank" && r.word(1) === "you" && r.toks.length - r.i === 2))) {
    const words = r.toks.slice(r.i).map((t) => t.word);
    r.i = r.toks.length;
    return { e: stressed(first, c(name(words.join(" ")))) };
  }
  let e: Expr;
  let kind: Kind | undefined;
  // "and like add them up": the hedge blurs the order it opens.
  if (first.word === "like" && canBeVerb(r.word(1)) && !r.is("Noun", 1) && r.toks.length - r.i > 2) {
    r.next();
    const hedged = clause(r);
    return { e: c("MarkFuzzy", "like", hedged.e), ...(hedged.kind ? { kind: hedged.kind } : {}) };
  }
  if (WH.has(first.word)) {
    // "what 17 times 3 is?": statement order after the question word, read as "what is".
    const at = r.i;
    r.next();
    const plain = embeddedQuestion(r, first);
    if (plain && (r.done() || clauseBoundary(r))) [e, kind] = [plain, "Interrogative"];
    else {
      r.i = at;
      [e, kind] = [whQuestion(r), "Interrogative"];
    }
  } else if (AUX.has(first.word) && !(first.word === "do" && (r.word(1) === "not" || (POINTING.has(r.word(1)) && !r.is("Verb", 2))))) [e, kind] = [helperQuestion(r), "Interrogative"];
  else if (first.word === "please" || negatedOrder(new Reader(r.toks.slice(r.i))) || opensOrder(r)) [e, kind] = [order(r), "Imperative"];
  else {
    // A thing named and nothing said about it is a fragment, and a fragment has no mood.
    const said = claim(r);
    e = said.e;
    kind = said.fragment ? undefined : "Declarative";
  }
  if (!r.done() && !clauseBoundary(r) && !(kind === undefined && (r.toks[r.i - 1]?.comma || DET.has(r.word())))) {
    const error = new Unparsed(`left over: "${r.toks.slice(r.i).map((t) => t.word).join(" ")}"`);
    error.leftAt = r.i;
    throw error;
  }
  return kind ? { e, kind } : { e };
}

/**
 * Code pasted without backticks, "ItIs(Imperative(You()))": a capitalised head directly
 * followed by "(" opens a call, which runs to its balancing ")" or, left unbalanced, to the
 * last ")" on the line. It is kept as inline code, exactly as typed.
 */
function bareCode(text: string, keep: (code: string) => string): string {
  let out = "";
  let i = 0;
  const head = /\b[A-Z][A-Za-z0-9]*\(/g;
  for (let m = head.exec(text); m; m = head.exec(text)) {
    if (m.index < i) continue;
    let depth = 0;
    let end = -1;
    let lastClose = -1;
    for (let j = m.index + m[0].length - 1; j < text.length && text[j] !== "\n"; j += 1) {
      if (text[j] === "(") depth += 1;
      else if (text[j] === ")") {
        depth -= 1;
        lastClose = j;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) end = lastClose + 1;
    if (end <= 0) continue;
    out += text.slice(i, m.index) + keep(text.slice(m.index, end));
    i = end;
    head.lastIndex = end;
  }
  return out + text.slice(i);
}

export interface RuleReading {
  lines: string[];
}

/**
 * The rule reading of a message, or why there is none. Words the rules cannot read are kept
 * as said, `Unclear("yo whatever")`, and listed in `unread`; the rest is still read.
 *
 * Markdown and verbatim content are handled before any grammar: a fenced block becomes a
 * binding, `$block1 = Block("rust", "...")`; a heading is `Heading(2, "Task")`; a list line
 * is `Item(1, ...)` around the reading of its text; backticked text, links and quotes are
 * cut out as verbatim tokens so the tagger never sees them (`design/reading-spec.md` Part 3).
 */
export function parseRules(message: string): { reading?: RuleReading; why?: string; unread?: string[] } {
  spans = [];
  unread = [];
  pointAt = undefined;
  mentions = [];
  bindings = [];
  inCondition = false;
  // Nothing in it is a word: kept verbatim, so the system can say it did not understand.
  if (unclear(message.replace(/`[^`]*`|https?:\/\/\S+/g, ""))) return { reading: { lines: [format(c("Unclear", message.trim()))] } };
  bindMentions = (nlp(message).sentences().out("array") as string[]).length > 1;
  const verbatim = (e: Expr) => ` verbatim${spans.push(e) - 1} `;
  const lines: string[] = [];
  const blocks: string[] = [];
  let text = message.replace(/^(`{3,})([\w+-]*)[ \t]*\n([\s\S]*?)\n\1[ \t]*$/gm, (_m, _f, lang: string, body: string) => {
    const v = `block${blocks.length + 1}`;
    blocks.push(format(lang ? c("Block", lang, body) : c("Block", body)));
    return `\u0000${v}\u0000`;
  });
  text = text
    .replace(/`([^`\n]+)`/g, (_m, code: string) => verbatim(c("InlineCode", code)));
  text = bareCode(text, (code) => verbatim(c("InlineCode", code)))
    .replace(/https?:\/\/[^\s)]+[^\s).,!?]/g, (url) => verbatim(url))
    .replace(/"([^"\n]+)"/g, (_m, q: string) => verbatim(q));
  // Arithmetic in symbols is read by precedence, not by the grammar: "(2 + 3) * 4".
  text = mathSpans(text, verbatim);
  // "$5" is an amount, its unit around its number like Hours(3).
  const CURRENCY: Record<string, string> = { $: "Dollars", "€": "Euros", "£": "Pounds" };
  text = text.replace(/([$€£])(\d+(?:\.\d+)?)\b/g, (_m, sign: string, n: string) => verbatim(c(CURRENCY[sign], Number(n))));

  try {
    let paragraph: string[] = [];
    const flush = (introducing?: string) => {
      const joined = paragraph.join(" ").trim();
      paragraph = [];
      if (!joined) return;
      const sentences = (nlp(joined).sentences().out("array") as string[]).map((x) => x.trim()).filter(Boolean);
      sentences.forEach((one, i) => {
        pointAt = introducing && i === sentences.length - 1 && /:\s*$/.test(one) ? introducing : undefined;
        const read = sentence(one.replace(/:\s*$/, "")).map(format);
        // A phrase bound in this sentence is written before the lines that use it.
        lines.push(...bindings, ...read);
        bindings = [];
        pointAt = undefined;
      });
    };
    const rows = text.split("\n");
    for (let k = 0; k < rows.length; k += 1) {
      const row = rows[k];
      const block = /^\u0000(block\d+)\u0000$/.exec(row.trim());
      if (block) {
        // Bound first, so the line that introduces it can point at it.
        const v = block[1];
        const intro = paragraph.length ? paragraph.pop()! : undefined;
        flush();
        lines.push(`$${v} = ${blocks[Number(v.slice(5)) - 1]}`);
        if (intro) {
          paragraph.push(intro);
          flush(v);
        }
        continue;
      }
      // "> quoted text": someone else's words, kept verbatim.
      const quote = /^\s*>\s?(.*)$/.exec(row);
      if (quote) {
        flush();
        lines.push(format(c("Quote", quote[1].trim())));
        continue;
      }
      const heading = /^\s*(#{1,6})\s+(.*)$/.exec(row);
      const numbered = /^\s*(\d+|[A-Z])[.)]\s+(.*)$/.exec(row);
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(row);
      if (heading || numbered || bullet) {
        // The line before a block is the one that introduces it.
        flush();
        if (heading) lines.push(format(c("Heading", heading[1].length, heading[2].trim())));
        else {
          const content = (numbered ? numbered[2] : bullet![1]).trim();
          const read = sentence(content);
          const [first, ...rest] = read;
          const label = numbered ? (/^\d+$/.test(numbered[1]) ? Number(numbered[1]) : numbered[1]) : undefined;
          lines.push(format(label !== undefined ? c("Item", label, first) : c("Item", first)), ...rest.map(format));
        }
        continue;
      }
      if (!row.trim()) {
        // A blank line before a block still leaves the line above it introducing the block.
        const next = rows.slice(k + 1).find((x) => x.trim());
        if (!(next && /^\u0000block\d+\u0000$/.test(next.trim()))) flush();
        continue;
      }
      paragraph.push(row);
    }
    flush();
    if (!lines.length) return { why: "nothing to read" };
    return unread.length ? { reading: { lines }, unread } : { reading: { lines } };
  } catch (error) {
    if (error instanceof Unparsed) return { why: error.message };
    throw error;
  }
}
