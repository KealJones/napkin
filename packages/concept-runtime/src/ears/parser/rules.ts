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
import { type Expr, c, format } from "../../concept/expression.js";

interface Tok {
  word: string;
  /** As typed, for stress: "NOT" keeps its capitals here. */
  raw: string;
  tags: Set<string>;
  /** A comma followed this word. */
  comma: boolean;
}

class Unparsed extends Error {}
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
const POINTING = new Set(["it", "that", "this", "those", "these", "them", "him", "her"]);
const PREP = new Set(["in", "on", "at", "for", "to", "of", "with", "about", "from", "by", "into", "over", "under", "after", "before", "until", "near"]);
const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|dozen)$/;
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
const ORDINAL = /^(first|second|third|fourth|fifth|last|next|previous|other)$/;
const FILLER = /^(hey|hi|hmm|hm|ah|hem|uh|uhm|uhmm|um|so+|ok|okay|well|now|also|lol|idk|wait|btw|basically)$/;
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
  const first = simpleNounPhrase(r, subject, stopAtVerb);
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
  // "the second one", "the other one", "that one": a pointing phrase, kept verbatim.
  if (r.word() === "the" && ORDINAL.test(r.word(1)) && r.word(2) === "one") {
    const words = [r.next().raw, r.next().raw, r.next().raw];
    return c("Ref", words.join(" "));
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
  // "that" is an article only before a noun ("that bug"), never before a bare describer.
  while (DET.has(r.word()) && !(POINTING.has(r.word()) && !r.is("Noun", 1) && !(r.is("Adjective", 1) && r.is("Noun", 2)))) r.next();

  const t = r.peek() ?? fail("expected a noun phrase");
  if (POINTING.has(t.word)) {
    r.next();
    // "it" as the subject of being is the ambient it ("it is late", "will it be"): It().
    if (t.word === "it" && subject) return c("It");
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
    return c("Percent", Number(t.word.slice(0, -1)));
  }
  const time = clock(t.word);
  if (time) {
    r.next();
    return time;
  }
  if (t.tags.has("Value") || NUMBER_WORD.test(t.word)) {
    r.next();
    const n = /^\d+(\.\d+)?$/.test(t.word) ? Number(t.word) : c("Number", t.word);
    // "17 times 4": an operator between two values, verb first because a number is never a head.
    if (INFIX[r.word()] && (r.is("Value", 1) || NUMBER_WORD.test(r.word(1)))) {
      const op = INFIX[r.next().word];
      return c(op, n, nounPhrase(r));
    }
    // An amount is its unit around its number: "5 days" is Days(5).
    if (r.is("Noun") && !r.is("Pronoun") && !INFIX[r.word()] && !clock(r.word())) return c(name(r.next().word), n, ...prepositions(r, true));
    // "2, 4 and 9": values said side by side are a List.
    const more: Expr[] = [];
    while ((t.comma || r.toks[r.i - 1]?.comma || r.word() === "and") && (r.is("Value", r.word() === "and" ? 1 : 0))) {
      if (r.word() === "and") r.next();
      const v = r.next();
      more.push(/^\d+(\.\d+)?$/.test(v.word) ? Number(v.word) : c("Number", v.word));
    }
    return more.length ? c("List", n, ...more) : n;
  }

  if (QUANTIFIER.has(t.word) && !r.is("Pronoun")) {
    r.next();
    return wrap(name(t.word), nounPhrase(r));
  }
  if (t.word === "not") {
    r.next();
    return c("Not", nounPhrase(r));
  }
  const describers: Tok[] = [];
  while ((r.is("Adjective") || (r.is("Adverb") && r.is("Adjective", 1))) && !COPULA.has(r.word()) && !(r.word(1) === "than")) describers.push(r.next());
  // "bigger than the other one": a comparative and its "than" name one relation.
  if (r.is("Adjective") && r.word(1) === "than") {
    const adj = r.next().word;
    r.next();
    return c(name(adj) + "Than", nounPhrase(r));
  }
  const nouns: Tok[] = [];
  while (r.peek() && (r.is("Noun") || (r.is("Date") && !r.is("Value")) || r.word() === "lot") && !r.is("Pronoun") && !r.is("QuestionWord") && !PREP.has(r.word()) && !COPULA.has(r.word())) {
    // "the weather tomorrow": a date word names a time, not part of the kind before it.
    if (nouns.length && r.is("Date") && !nouns[nouns.length - 1].tags.has("Date")) break;
    // "sister's birthday": an owning noun wraps what it owns.
    if (r.is("Possessive") && nouns.length === 0 && r.is("Noun", 1)) {
      const owner = r.next();
      return stressed(owner, wrap(name(owner.word.replace(/'s$/, "")), nounPhrase(r)));
    }
    nouns.push(r.next());
  }
  // After a helper, "the build go": the last word is the verb the helper carries.
  if (stopAtVerb && nouns.length > 1 && canBeVerb(nouns[nouns.length - 1].word)) {
    r.i -= 1;
    nouns.pop();
  }
  if (!nouns.length) {
    if (describers.length) return describers.reduceRight<Expr>((inner, d) => c(name(d.word), inner), c(name(describers.pop()!.word)));
    fail(`expected a noun at "${r.word()}"`);
  }
  // Nouns side by side name one kind of thing: "cover letter" is CoverLetter.
  const kind = nouns.map((n) => name(n.word)).join("");
  let core: Expr = stressed(nouns[nouns.length - 1], c(kind, ...prepositions(r, true), ...relative(r)));
  for (const d of [...describers].reverse()) core = stressed(d, wrap(name(d.word), core));
  return core;
}

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
    return [c(name(rel.word), verbPhrase(r))];
  }
  return [];
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
    } else if (WH.has(w) || w === "whether" || (w === "if" && out.length)) {
      // "show me what you know", "tell me whether it will rain": a question inside, as said.
      const q = r.next();
      if (r.done() || clauseBoundary(r)) out.push(c(name(q.word)));
      else out.push(c(name(q.word), clause(r)));
    } else if (w === "to" && (r.is("Verb", 1) || (canBeVerb(r.word(1)) && (DET.has(r.word(2)) || POSSESSIVE[r.word(2)] || r.is("Noun", 2))))) {
      r.next();
      out.push(verbPhrase(r));
    } else if (PREP.has(w)) {
      out.push(...prepositions(r));
    } else if (r.is("Adverb") || r.is("Date") && !r.is("Value")) {
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

/** A new clause starts at "then", or at "and" followed by a subject and a verb. */
function clauseBoundary(r: Reader): boolean {
  if (r.word() === "then") return true;
  // "take 10, double it": a comma before a verb starts the next clause.
  const before = r.toks[r.i - 1];
  if (before?.comma && (r.is("Verb") || r.word() === "then" || AUX.has(r.word()) || WH.has(r.word()))) return true;
  if (r.word() === "and" && (PERSON[r.word(1)] || r.word(1) === "it") && (r.is("Verb", 2) || COPULA.has(r.word(2)))) return true;
  // "and update the tests", "and tell me": an order joined on, recognised by what follows it.
  if (r.word() === "and" && canBeVerb(r.word(1)) && (DET.has(r.word(2)) || POSSESSIVE[r.word(2)] || PERSON[r.word(2)] || POINTING.has(r.word(2)))) return true;
  return false;
}

function verbPhrase(r: Reader): Expr {
  const v = r.next();
  if (!v.tags.has("Verb") && !v.tags.has("Infinitive") && !canBeVerb(v.word)) fail(`expected a verb at "${v.word}"`);
  // "says hello world": what is said is quoted, not understood.
  if (SAYING.has(v.word) && !r.done() && !PERSON[r.word()] && !DET.has(r.word()) && !PREP.has(r.word())) {
    const words: string[] = [];
    while (!r.done() && !clauseBoundary(r)) words.push(r.next().raw);
    return c(name(v.word), words.join(" "));
  }
  return stressed(v, c(name(v.word), ...complements(r)));
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
  if (AUX.has(r.word()) || COPULA.has(r.word())) {
    const aux = r.next();
    const fused = head + name(aux.word === "'s" ? "is" : aux.word);
    if (r.done()) return c(fused);
    const subject = nounPhrase(r, true, true);
    const rest = complements(r);
    return c(fused, subject, ...rest);
  }
  // "who wrote hamlet": the question word is the subject.
  if (r.is("Verb") && !r.is("Noun")) return c(head, verbPhrase(r));
  // "what day will it be ...", "how many angels can dance ...": what is asked about, then the rest.
  const asked = r.is("Adjective") ? c(name(r.next().word)) : nounPhrase(r);
  if (r.done()) return c(head, asked);
  if (PREP.has(r.word())) return c(head, asked, ...complements(r));
  if (AUX.has(r.word())) {
    const aux = r.next();
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
  const rest = r.is("Verb") && !r.is("Noun") ? [verbPhrase(r)] : complements(r);
  return stressed(aux, c(name(aux.word), subject, ...rest));
}

/** A claim: the thing first, its predicate inside it, unless the subject cannot be a head. */
function claim(r: Reader): Expr {
  const subject = nounPhrase(r, true);
  const canHead = typeof subject === "object" && subject !== null && "head" in subject && subject.head !== "Ref";
  let predicate: Expr;
  if (COPULA.has(r.word())) {
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
  } else if (r.done() || clauseBoundary(r)) {
    // A fragment: a thing named and nothing said about it ("banana", "and germany?").
    return subject;
  } else {
    return fail(`no verb after the subject, at "${r.word()}"`);
  }
  if (!canHead) {
    const p = predicate as { head: string; args: { value: Expr }[] };
    return c(p.head, subject, ...p.args.map((a) => a.value));
  }
  return inside(subject, predicate);
}

/**
 * The predicate goes inside the innermost thing the subject names, through owners and
 * describers: My(Dad(IsA(Doctor()))), Old(Car(Broke())). A wrapper is a call whose only
 * argument is itself a call; a preposition or a value stops the descent.
 */
function inside(subject: Expr, predicate: Expr): Expr {
  const s = subject as { head: string; args: { name?: string; value: Expr }[] };
  if (WRAPPERS.has(s as object) && s.args.length === 1) return c(s.head, inside(s.args[0].value, predicate));
  return c(s.head, ...s.args.map((a) => a.value), predicate);
}

/** One line per clause: clauses split at "then", at commas before a verb, and at "and" + clause. */
function sentence(text: string): Expr[] {
  const toks = tokens(text.replace(/[?.!]+\s*$/, ""));
  if (!toks.length) fail("empty");
  const out: Expr[] = [];
  const r = new Reader(toks);
  // "hey there" is one fixed phrase; other leading filler is kept verbatim as an aside.
  if (r.word() === "hey" && r.word(1) === "there") {
    r.next();
    r.next();
    out.push(c("HeyThere"));
  }
  const filler: string[] = [];
  while (FILLER.test(r.word()) && !(r.word() === "now" && r.is("Verb", 1) === false && r.done())) filler.push(r.next().raw);
  if (filler.length) out.push(c("MarkAside", filler.join(" ")));
  while (!r.done()) {
    while (r.word() === "then" || r.word() === "and" || r.word() === ",") r.next();
    if (r.done()) break;
    out.push(clause(r));
  }
  return out;
}

/**
 * An order starts with a verb. A word the tagger calls both ("compare", "review") opens an
 * order when it can be a verb and is not naming a person, a place or several things.
 */
function opensOrder(r: Reader): boolean {
  const t = r.peek()!;
  if (t.tags.has("Pronoun") || t.tags.has("Determiner") || t.tags.has("Possessive") || t.tags.has("Adjective")) return false;
  if (t.tags.has("Verb") && !t.tags.has("Noun")) return true;
  return canBeVerb(t.word) && !t.tags.has("Plural") && !t.tags.has("ProperNoun") && !t.tags.has("Date") &&
    !r.is("Verb", 1) && !COPULA.has(r.word(1));
}

function clause(r: Reader): Expr {
  const first = r.peek()!;
  let e: Expr;
  if (WH.has(first.word)) e = whQuestion(r);
  else if (AUX.has(first.word) && !(first.word === "do" && r.word(1) === "not")) e = helperQuestion(r);
  else if (first.word === "please" || negatedOrder(new Reader(r.toks.slice(r.i))) || opensOrder(r)) e = order(r);
  else e = claim(r);
  if (!r.done() && !clauseBoundary(r)) fail(`left over: "${r.toks.slice(r.i).map((t) => t.word).join(" ")}"`);
  return e;
}

export interface RuleReading {
  lines: string[];
}

/**
 * The rule reading of a message, or why there is none. Markdown, code and anything with
 * more than a few clauses are not attempted yet: they go to the model.
 */
export function parseRules(message: string): { reading?: RuleReading; why?: string } {
  if (/`|^\s*[#>*-]|^\s*\d+[.)]\s/m.test(message)) return { why: "markup is not handled by rules yet" };
  const sentences = (nlp(message).sentences().out("array") as string[]).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length || sentences.length > 4) return { why: "too many sentences for rules" };
  try {
    return { reading: { lines: sentences.flatMap((s) => sentence(s).map(format)) } };
  } catch (error) {
    if (error instanceof Unparsed) return { why: error.message };
    throw error;
  }
}
