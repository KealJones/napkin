/**
 * Reading a message by its words' senses and holes, with no grammar.
 *
 * The message is a row of words. Each word has senses (frame/senses.ts), and a word typed
 * wrong has the senses of the words it may have meant as well, each at a cost. Nothing links a
 * word to a parent by where it stands. Instead each sense with holes takes the neighbours that
 * fit them: an operation takes values beside it (and the graph's Binds says which takes first),
 * a relation takes the thing it is a fact of and leaves the other end for the question word to
 * ask, a word naming a part of a value ("year") takes that part, a kind word ("movies") keeps
 * only what is of that kind.
 *
 * Every reading of the whole row is scored together: holes filled count for it, words left
 * unused count against it. A reading is used only when it uses every word that says something;
 * otherwise the message goes to the rules hearing (`Hear()`), as before. So this can only add
 * answers it can account for, word by word.
 *
 * When a word had more than one sense that could have been read ("born": where, or when), the
 * one taken is kept with the words beside it (ReadBeside), and counts for that sense the next
 * time those words are beside it.
 */
import { wikidataItem } from "../research/wikidata.js";
import { keepReading } from "../resolve/learned.js";
import { type Expr, c, call, equal, format, isCall, parse, walk } from "../concept/expression.js";
import { knownAsName, standsAsNameIn } from "../ears/parser/words.js";
import { findNamed } from "../runtime/individuals.js";
import { asks as asksIn, compose, filled, piecesOf, thingOf, type Piece } from "./compose.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words as hostWords } from "../runtime/host.js";
import { alternatives, beside, commonness, expandBare, isWord, settled, unbare, useGraphNames } from "../ears/parser/words.js";
import { Runtime } from "../runtime/evaluator.js";
import { typesOf } from "../runtime/types.js";
import { reachesBehaviour, runs, UNIVERSAL } from "../runtime/select.js";
import type { ConceptStore } from "../store/store.js";
import { learnedReadings } from "../resolve/learned.js";
import { MONTHS } from "../ears/lift.js";
import type { Edit } from "../resolve/readings.js";
import { akin, called, chain, holdsFacts, sensesOf, STRUCTURAL, wordsOf, type Sense } from "./senses.js";

export interface Framed {
  /** What was read, as Concepts: for showing, not for running. */
  readonly display: Expr;
  readonly result: Expr;
  /** The words as read. */
  readonly text: string;
  readonly edits: Edit[];
  /** Each word that had more than one sense, and the one taken. */
  readonly chosen: { word: string; sense: string }[];
  /** Why this reading, in plain words: what each word was taken as, what filled each hole, what else was weighed. */
  readonly why?: string[];
}

interface Word {
  readonly text: string;
  readonly senses: Sense[];
}

interface Item {
  readonly i: number;
  readonly j: number;
  /** What runs: the Concepts the words stand for. */
  readonly expr: Expr;
  /** The operations it was built with, each as which word took which Concept: features to learn by. */
  readonly ops?: readonly string[];
  /** The words as said: the Concepts the words are. */
  readonly said: Expr;
  readonly score: number;
  /** How tightly its outermost operation binds; Infinity when it is closed (a value, or a prefix form). */
  readonly binds: number;
}

/** What it costs to read a word as another: by the share of it changed, less how much more common the other is. */
const COST = 3;
const SPACE = 0.5;
/** What the best reading must beat the next by, to be taken without asking. */
const MARGIN = 0.5;
const BESIDE = 0.4;
const REAL = 1;
/** Most readings of the row tried. */
const MOST = 48;

/** A hole that says what kind of value it takes, filled: better evidence than one that takes anything. */
const typedFit = (op: Extract<Sense, { type: "op" }>) => 0.25 * op.holes.filter((h) => h !== "Concept").length;
const is = (w: Word, type: Sense["type"]) => w.senses.some((s) => s.type === type);
const only = (w: Word, ...types: Sense["type"][]) => w.senses.length > 0 && w.senses.every((s) => types.includes(s.type));
/** A word that helps say the others and is not itself what is said. */
const optional = (w: Word) => only(w, "glue", "question");

function values(words: readonly Word[]): Map<string, Item[]> {
  const at = new Map<string, Item[]>();
  const get = (i: number, j: number) => at.get(`${i},${j}`) ?? [];
  const put = (item: Item) => {
    const key = `${item.i},${item.j}`;
    const list = [...get(item.i, item.j), item].sort((a, b) => b.score - a.score).slice(0, 3);
    at.set(key, list);
  };
  words.forEach((w, i) => {
    for (const s of w.senses) if (s.type === "value") put({ i, j: i + 1, expr: s.value, said: s.value, score: 0, binds: Infinity });
  });
  // A date: a month and a day beside it, either way round, and maybe a year ("june 3", "3rd of june",
  // "june 3, 1990"). The month is told by the month's number its word carries.
  const monthAt = (k: number): number | undefined => {
    const g = words[k]?.senses.find((s) => s.type === "glue" && /^Month\d+$/.test(s.head));
    return g && g.type === "glue" ? Number(g.head.slice(5)) : undefined;
  };
  const numberAt = (k: number): number | undefined => {
    const v = words[k]?.senses.find((s) => s.type === "value");
    return v && v.type === "value" && typeof v.value === "number" && Number.isInteger(v.value) ? v.value : undefined;
  };
  for (let i = 0; i < words.length; i++) {
    const found: { month: number; day: number; end: number }[] = [];
    const m = monthAt(i);
    const d = numberAt(i + 1);
    if (m !== undefined && d !== undefined && d >= 1 && d <= 31) found.push({ month: m, day: d, end: i + 2 });
    const day = numberAt(i);
    const of = words[i + 1]?.senses.some((s) => s.type === "glue" && s.head === "Of") ? 1 : 0;
    const m2 = monthAt(i + 1 + of);
    if (day !== undefined && day >= 1 && day <= 31 && m2 !== undefined) found.push({ month: m2, day, end: i + 2 + of });
    for (const f of found) {
      const comma = words[f.end]?.text === "," ? 1 : 0;
      const y = numberAt(f.end + comma);
      const year = y !== undefined && y >= 1000 && y <= 2999 ? y : undefined;
      const date = call("Date", [...(year === undefined ? [] : [{ name: "year", value: year }]), { name: "month", value: f.month }, { name: "day", value: f.day }]);
      put({ i, j: year === undefined ? f.end : f.end + comma + 1, expr: date, said: date, score: 0.5, binds: Infinity });
    }
  }
  // A list: values one after another, parted by commas or "and" ("3, 5 and 10").
  const valueAt = (k: number) => words[k]?.senses.find((s) => s.type === "value");
  const parts = (k: number) => words[k] !== undefined && (words[k].text === "," || words[k].senses.some((s) => s.type === "glue" && s.head === "And"));
  for (let i = 0; i < words.length; i++) {
    if (!valueAt(i) || (i >= 2 && parts(i - 1) && valueAt(i - 2))) continue;
    const items: Expr[] = [];
    let j = i;
    while (valueAt(j)) {
      items.push((valueAt(j) as { value: Expr }).value);
      if (parts(j + 1) && parts(j + 2) && valueAt(j + 3)) j += 3;
      else if (parts(j + 1) && valueAt(j + 2)) j += 2;
      else break;
    }
    if (items.length >= 2) {
      const list = call("List", items.map((value) => ({ value })));
      put({ i, j: j + 1, expr: list, said: list, score: 0.25 * items.length, binds: Infinity });
    }
  }
  const n = words.length;
  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len;
      // Brackets close what they hold: "(2+3)*4" adds first.
      if (len >= 3 && words[i].text === "(" && words[j - 1].text === ")") for (const inner of get(i + 1, j - 1)) put({ ...inner, i, j, binds: Infinity });
      // Infix: a value, the operation, maybe a word that helps say it ("divided by"), a value.
      for (let k = i + 1; k < j - 1; k++) {
        for (const op of words[k].senses) {
          if (op.type !== "op" || op.holes.length !== 2) continue;
          for (const skip of [0, 1]) {
            const r0 = k + 1 + skip;
            if (r0 >= j || (skip && !only(words[k + 1], "glue"))) continue;
            for (const L of get(i, k)) {
              for (const R of get(r0, j)) {
                // Which operation takes its neighbour first is the graph's: Binds(120) before Binds(110).
                let penalty = 0;
                if (L.binds < op.binds || (L.binds === op.binds && op.right)) penalty += 1;
                if (R.binds < op.binds || (R.binds === op.binds && !op.right)) penalty += 1;
                put({ i, j, ops: [...(L.ops ?? []), ...(R.ops ?? []), `op:${op.word}=${op.target}`], expr: c(op.target, L.expr, R.expr), said: c(op.word, L.said, R.said), score: L.score + R.score + 2 + typedFit(op) - penalty - 0.1 * skip, binds: op.binds });
              }
            }
          }
        }
      }
      // One hole: the operation, maybe a word that marks what it takes ("of"), a value or a list
      // ("square root of 144", "average of 3, 5 and 10", "half 10").
      for (const op of words[i].senses) {
        if (op.type !== "op" || op.holes.length !== 1) continue;
        for (const skip of [0, 1]) {
          // Only a word that marks what it takes ("of"), not one that says what something is.
          if (skip && !(only(words[i + 1], "glue") && !words[i + 1].senses.some((x) => x.type === "glue" && x.copula))) continue;
          for (const X of get(i + 1 + skip, j)) {
            put({ i, j, ops: [...(X.ops ?? []), `op:${op.word}=${op.target}`], expr: c(op.target, X.expr), said: c(op.word, X.said), score: X.score + 1.5 + typedFit(op) - 0.1 * skip, binds: Infinity });
          }
        }
      }
      // Postfix: a value, then an operation of one hole said after what it takes ("3 squared", "5
      // cubed"), a little less likely than said before it.
      // Not a word that also marks what follows it ("in", "of"): that takes what comes after.
      for (const op of words[j - 1].senses.some((s) => s.type === "glue") ? [] : words[j - 1].senses) {
        if (op.type !== "op" || op.holes.length !== 1 || j - 1 <= i) continue;
        for (const X of get(i, j - 1)) {
          if (isCall(X.expr) && X.binds === Infinity && X.ops?.length) continue;
          put({ i, j, ops: [...(X.ops ?? []), `op:${op.word}=${op.target}`], expr: c(op.target, X.expr), said: c(op.word, X.said), score: X.score + 1.25 + typedFit(op), binds: Infinity });
        }
      }
      // Prefix: the operation, a value, a joining word ("and", or "from", which puts what follows it first), a value.
      for (const op of words[i].senses) {
        if (op.type !== "op" || op.holes.length !== 2) continue;
        for (let m = i + 2; m < j; m++) {
          const glue = words[m].senses.find((s) => s.type === "glue");
          for (const X of get(i + 1, m)) {
            for (const Y of get(glue ? m + 1 : m, j)) {
              const first = glue?.type === "glue" && glue.marksFirst;
              const [a, b] = first ? [Y, X] : [X, Y];
              put({ i, j, ops: [...(a.ops ?? []), ...(b.ops ?? []), `op:${op.word}=${op.target}`], expr: c(op.target, a.expr, b.expr), said: c(op.word, a.said, b.said), score: X.score + Y.score + 2 + typedFit(op) - (glue ? 0.1 : 0), binds: Infinity });
            }
          }
        }
      }
    }
  }
  return at;
}

/** A reading that came close: what it read, and the words it could not fit. */
interface Miss {
  readonly reading: Expr;
  readonly left: readonly string[];
  /** "fit": words it could not fit into the reading; "thing": words it could not take as one thing. */
  readonly kind?: "fit" | "thing";
}

interface Reading {
  /** It changes the graph (a statement kept): read only from words as typed, or from slips of non-words. */
  readonly writes?: boolean;
  readonly score: number;
  /** What it means, for telling two readings apart: what runs, or what is asked of the graph. */
  readonly key: string;
  /**
   * What choices made it, named: the kind of reading, which sense each word took, which operation
   * each word stood for. Confirmed and corrected readings weigh these (`weight`), so what held before
   * counts for a reading made of the same choices.
   */
  readonly features: readonly string[];
  /** What it is about, said when asking which reading was meant: the relation asked. */
  readonly says?: Expr;
  /** How it used the words beside its own, in plain words, for `explain`. */
  readonly notes?: readonly string[];
  readonly display: Expr;
  readonly run: () => Promise<Expr | undefined>;
  readonly chosen: { word: string; sense: string }[];
  readonly learn?: () => void;
}

/** Asked: a "?", a question word, or a helper put first ("is tom taller than ann", "does tom live in denver"). */
const asking = (words: readonly Word[], question: boolean) =>
  question || words.some((w) => is(w, "question")) || (words.length > 1 && words[0].senses.some((s) => s.type === "glue" && (s.copula || s.helper === true)));
const outsideOptional = (words: readonly Word[], i: number, j: number) => words.every((w, k) => (k >= i && k < j) || optional(w));

/** Readings that work something out: a value asked for, a claim about one, an operation missing a value. */
function computations(runtime: Runtime, words: readonly Word[], question: boolean, message = "", misses: Miss[] = []): Reading[] {
  const items = values(words);
  const out: Reading[] = [];
  const mood = c(asking(words, question) ? "Interrogative" : "Declarative");
  for (const list of items.values()) {
    for (const item of list) {
      // Worked out, but with words beside it that say something it could not take.
      if (isCall(item.expr) && !outsideOptional(words, item.i, item.j)) {
        misses.push({ reading: item.said, left: words.filter((w, k) => (k < item.i || k >= item.j) && !optional(w)).map((w) => w.text) });
      }
      // A value asked for: the item covers every word but those that only help say it.
      if (item.binds !== Infinity || isCall(item.expr)) {
        if (outsideOptional(words, item.i, item.j) && (isCall(item.expr) || asking(words, question))) {
          out.push({
            key: format(item.expr),
            features: ["read:value", ...(item.ops ?? [])],
            score: item.score + 2,
            display: c("ContextScope", mood, c("Value", item.said)),
            chosen: [],
            // A question is answered; a doing asked for ("subtract 3 from 10") gives what it comes to.
            // What still holds an operation it took is not worked out: not a reading at all (a residual).
            // A doing asked for ("subtract 3 from 10", the word a verb said first) gives what it comes
            // to; a thing named that works out to a value ("average of 3, 5, 10") is answered, as a question is.
            run: async () => {
              const v = await runtime.evaluate(item.expr, c("Execution"));
              if (residual(v, item.ops ?? [])) return undefined;
              const doing = !asking(words, question) && item.i === 0 && (hostWords(message)[0]?.tags ?? []).includes("Verb");
              return doing || (isCall(v) && v.head === "Answer") ? v : c("Answer", v);
            },
          });
        }
      }
    }
  }
  // A claim: a value, a word that says what it is ("is", "was"), another value.
  words.forEach((w, k) => {
    if (!w.senses.some((s) => s.type === "glue" && s.copula)) return;
    // A word that only helps may stand on either side: "equal to", "the same as".
    const helper = (x: Word | undefined) => x !== undefined && only(x, "glue") && !x.senses.some((s) => s.type === "glue" && s.copula);
    const before = helper(words[k - 1]) ? k - 1 : k;
    const after = helper(words[k + 1]) ? k + 2 : k + 1;
    for (let i = 0; i < before; i++) {
      for (const A of items.get(`${i},${before}`) ?? []) {
        for (let j = after + 1; j <= words.length; j++) {
          for (const B of items.get(`${after},${j}`) ?? []) {
            if (!outsideOptional(words, i, j) || (!isCall(A.expr) && !isCall(B.expr))) continue;
            out.push({
              key: format(c("Claimed", A.expr, B.expr)),
              features: ["read:claim", ...(A.ops ?? []), ...(B.ops ?? [])],
              score: A.score + B.score + 3,
              display: c("ContextScope", mood, c("Claimed", A.said, B.said)),
              chosen: [],
              run: async () => {
                const v = await runtime.evaluate(c("Claimed", A.expr, B.expr), c("Execution"));
                return isCall(v) && v.head === "Answer" ? v : c("Answer", v);
              },
            });
          }
        }
      }
    }
  });
  // An operation with its first value and nothing after: the hole is asked for, not guessed.
  words.forEach((w, k) => {
    for (const op of w.senses) {
      if (op.type !== "op" || op.holes.length !== 2) continue;
      for (let i = 0; i < k; i++) {
        for (const L of items.get(`${i},${k}`) ?? []) {
          if (!outsideOptional(words, i, k + 1) || words.slice(k + 1).some((x) => !optional(x))) continue;
          const said = words.slice(i, k + 1).map((x) => x.text).join(" ");
          out.push({
            key: format(c("Unfilled", c(op.target, L.expr))),
            features: ["read:unfilled", ...(L.ops ?? []), `op:${op.word}=${op.target}`],
            score: L.score + 1,
            display: c("ContextScope", mood, c("Unfilled", c(op.word, L.said), c(op.holes[1]))),
            chosen: [],
            run: async () => call("Unfilled", [{ value: c(op.word, L.said) }, { value: c(op.holes[1]) }, { name: "said", value: said }]),
          });
        }
      }
    }
  });
  return out;
}

const relationsOf = (store: ConceptStore, id: string) => store.get(id)?.relations ?? [];
/** How many times a sense was taken for this word beside these neighbours. */
function besides(store: ConceptStore, relation: string, word: string, neighbours: readonly string[]): number {
  let n = 0;
  for (const r of relationsOf(store, relation)) {
    if (!isCall(r.claim) || r.claim.head !== "ReadBeside") continue;
    const [w, b] = r.claim.args.map((a) => a.value);
    if (w === word && typeof b === "string" && neighbours.includes(b)) n += r.stamps?.length ?? 1;
  }
  return n;
}

/** Readings that ask the graph for a fact: a thing, a relation of it, and what the other words say of the answer. */
function facts(store: ConceptStore, words: readonly Word[], question: boolean, pointed: string | undefined, misses: Miss[] = []): Reading[] {
  if (!asking(words, question)) return [];
  const out: Reading[] = [];
  const asks = words.flatMap((w) => w.senses.flatMap((s) => (s.type === "question" ? s.asks : [])));
  const things = words.flatMap((w, k) =>
    w.senses.flatMap((s) => (s.type === "entity" || s.type === "owner" ? [{ k, head: s.head }] : s.type === "pointer" && pointed ? [{ k, head: pointed }] : [])),
  );
  const relations = words.flatMap((w, k) => w.senses.flatMap((s) => (s.type === "relation" ? [{ k, head: s.head, inverse: s.inverse === true }] : [])));
  for (const thing of things) {
    for (const rel of relations) {
      if (rel.k === thing.k) continue;
      // Facts that hold whatever sense is meant: a word with several senses keeps each sense's
      // facts in its own context, and those are not mixed here.
      // A fact taken back (Retracts) no longer holds.
      const forward = relationsOf(store, thing.head).flatMap((r) =>
        r.context === undefined && isCall(r.claim) && r.claim.head === rel.head && r.claim.args[0] && !store.retracted(thing.head, r.claim) ? [r.claim.args[0].value] : [],
      );
      const inverse = store.asObject(thing.head).filter((t) => t.predicate === rel.head && t.context === undefined && !store.retracted(t.subject, t.expr)).map((t) => c(t.subject));
      // A word for the relation read the other way ("child" for Father) swaps which end is asked.
      const ways = rel.inverse ? ([["of", inverse], ["holding", forward]] as const) : ([["of", forward], ["holding", inverse]] as const);
      for (const [direction, found] of ways) {
        if (!found.length) continue;
        let answers: Expr[] = found;
        let part: string | undefined;
        let score = 4;
        let unused = 0;
        const unusedWords: string[] = [];
        // "is tom taller than ann": the other thing named, said after the relation, is among the answers: yes.
        let yes = false;
        const used: string[] = [];
        const notes: string[] = [];
        words.forEach((w, k) => {
          if (k === thing.k || k === rel.k || optional(w)) return;
          // "my dog's": an owner word that says whose the thing named next is.
          if (w.senses.some((s) => s.type === "owner") && k + 1 === thing.k) return void used.push(w.text);
          const other = w.senses.find((s) => s.type === "entity" && answers.some((a) => isCall(a) && a.head === s.head));
          // Only read forwards: the thing named first holds the relation to the one named after.
          if (other && direction === "of" && thing.k < rel.k && k > rel.k) {
            yes = true;
            score += 2;
            notes.push(`"${w.text}" is among the answers: yes.`);
            return void used.push(w.text);
          }
          // Another word for the same relation ("directed ... direct") says nothing more.
          if (w.senses.some((s) => s.type === "relation" && s.head === rel.head && (s.inverse === true) === rel.inverse)) return void used.push(w.text);
          // A word for the kind of thing asked: only answers of that kind.
          const kinds = w.senses.flatMap((s) => (s.type === "kind" ? [s.head] : []));
          // Its kinds, not its own name: "tom" is not a kind Tom is of.
          const ofKind = answers.filter((a) => typesOf(store, a).slice(1).some((t) => kinds.includes(t) || [...wordsOf(t), ...called(store, t)].some((x) => akin(x, w.text.toLowerCase()))));
          if (ofKind.length) {
            answers = ofKind;
            score += 2;
            notes.push(`"${w.text}" kept only answers of that kind.`);
            return void used.push(w.text);
          }
          // A word naming a part of the value: that part is the answer ("year" of a date).
          const lower = w.text.toLowerCase();
          const parted = answers.every((a) => isCall(a) && a.args.some((x) => x.name !== undefined && akin(x.name, lower)));
          if (parted && answers.length) {
            part = answers[0] && isCall(answers[0]) ? answers[0].args.find((x) => x.name !== undefined && akin(x.name, lower))?.name : undefined;
            score += 2;
            notes.push(`"${w.text}" named a part of the answer, which only ${readableName(rel.head)} has.`);
            return void used.push(w.text);
          }
          unused += 1;
          unusedWords.push(w.text);
        });
        if (unused) {
          misses.push({ reading: c("Asked", c(rel.head), c(thing.head)), left: unusedWords });
          continue;
        }
        // The relation's own word may name a part of its value too ("what year was he born", where
        // "year" is what stood for date of birth): that part is the answer.
        // Any word that stood for the relation counts: "year" and "born" both say date of birth.
        for (const w of part === undefined ? words : []) {
          const own = w.text.toLowerCase();
          if (!w.senses.some((x) => x.type === "relation" && x.head === rel.head)) continue;
          if (answers.length && answers.every((a) => isCall(a) && a.args.some((x) => x.name !== undefined && akin(x.name, own)))) {
            part = (answers[0] as { args: readonly { name?: string }[] }).args.find((x) => x.name !== undefined && akin(x.name, own))?.name;
            break;
          }
        }
        // Of the shape the question asks for: someone is a thing named, an amount a number (AnsweredBy).
        const shapes = words.flatMap((w) => w.senses.flatMap((s) => (s.type === "question" ? s.kinds : []))).flatMap((k) =>
          relationsOf(store, k).flatMap((r) => (isCall(r.claim) && r.claim.head === "AnsweredBy" && isCall(r.claim.args[0]?.value) ? [(r.claim.args[0].value as { head: string }).head] : [])),
        );
        const shapeOf = (v: Expr): string[] => (isCall(v) && !v.args.length ? [UNIVERSAL] : typesOf(store, v));
        if (!yes && shapes.length && !answers.every((a) => shapeOf(part && isCall(a) ? (a.args.find((x) => x.name === part)?.value ?? a) : a).some((k) => shapes.includes(k)))) continue;
        const relWords = [...wordsOf(rel.head), ...called(store, rel.head)];
        const answerKinds = answers.flatMap((a) => typesOf(store, a).flatMap((t) => [...wordsOf(t), ...called(store, t)]));
        if (asks.some((a) => relWords.includes(a) || answerKinds.includes(a))) score += 1;
        const relWord = words[rel.k].text.toLowerCase();
        const neighbours = used.map((u) => u.toLowerCase());
        score += Math.min(2, 0.5 * besides(store, rel.head, relWord, neighbours));
        const senses = words[rel.k].senses.filter((s) => s.type === "relation").length;
        const shown = answers.map((a) => (part && isCall(a) ? (a.args.find((x) => x.name === part)?.value ?? a) : a));
        const answer = yes ? c("True") : shown.length === 1 ? shown[0] : call("List", shown.map((value) => ({ value })));
        const asked = direction === "of" ? c(rel.head, c(thing.head), c("What")) : c(rel.head, c("What"), c(thing.head));
        out.push({
          key: format(answer),
          features: ["read:fact", `sense:${relWord}=${rel.head}${rel.inverse ? "~" : ""}`],
          says: c(rel.head),
          notes: [
            ...notes,
            ...((() => {
              const others = words[rel.k].senses.flatMap((x) => (x.type === "relation" && x.head !== rel.head ? [readableName(x.head)] : [])).filter((x) => x.trim());
              return senses > 1 && others.length ? [`"${relWord}" could also have been ${others.join(" or ")}.`] : [];
            })()),
          ],
          score,
          display: c("ContextScope", c("Interrogative"), part ? call("Asked", [{ value: asked }, { name: "part", value: part }]) : c("Asked", asked)),
          chosen: senses > 1 ? [{ word: relWord, sense: rel.head }] : [],
          run: async () => c("Answer", answer),
          learn: senses > 1 ? () => neighbours.forEach((b) => store.addRelation(rel.head, c("ReadBeside", relWord, b))) : undefined,
        });
      }
    }
  }
  // Asked what only the one talking can tell ("what is my name") and not told yet: not known, said
  // so. Nothing to look up: no one else holds it.
  if (!out.length && things.length === 1 && relations.length === 1) {
    const thing = things[0]!;
    const rel = relations[0]!;
    const speaker = words[thing.k]!.senses.some((s) => (s.type === "owner" || s.type === "entity") && s.head === thing.head) && thing.head === "Me";
    const rest = words.filter((w, k) => k !== thing.k && k !== rel.k && !optional(w));
    if (speaker && !rest.length && rel.k > thing.k) {
      const said = c(nameOf(words[thing.k]!.text), c(nameOf(words[rel.k]!.text)));
      out.push({
        key: `Unknown ${rel.head}`,
        features: ["read:unknown", `sense:${words[rel.k]!.text.toLowerCase()}=${rel.head}`],
        says: c(rel.head),
        notes: [`Nothing told yet of ${readableName(rel.head)} for the one talking.`],
        score: 3,
        display: c("ContextScope", c("Interrogative"), c("Asked", c(rel.head, c(thing.head), c("What")))),
        chosen: [],
        run: async () => c("Unknown", said),
      });
    }
  }
  return out;
}

/**
 * "is jaws a film": a word that says what something is, put first, then a thing and a kind. Yes
 * when the thing is of that kind (IsA, SubclassOf, through the chain); otherwise not read here, so
 * nothing is said no that the graph only does not know.
 */
function kindQuestions(store: ConceptStore, words: readonly Word[], pointed: string | undefined): Reading[] {
  if (!(words.length >= 3 && words[0].senses.some((s) => s.type === "glue" && s.copula))) return [];
  const rest = words.slice(1).filter((w) => !only(w, "glue"));
  if (rest.length !== 2) return [];
  const sense = rest[0].senses.find((s) => s.type === "entity" || s.type === "pointer");
  const thing = sense?.type === "entity" ? sense.head : sense?.type === "pointer" ? pointed : undefined;
  if (!thing || !thingWord(rest[1])) return [];
  const kind = rest[1].senses.find((s) => s.type === "kind")?.head ?? named([rest[1]]);
  if (!typesOf(store, c(thing)).slice(1).includes(kind)) return [];
  return [{ key: "True()", features: ["read:kind"], score: 6, display: c("ContextScope", c("Interrogative"), c("Asked", c("IsA", c(thing), c(kind)))), chosen: [], run: async () => c("Answer", c("True")) }];
}

/**
 * "I told them that 2 plus 2 was 5": a word that reports takes the statement after it (past who
 * it was said to, and a "that") as its hole, said by the thing before it. The statement is read
 * as its own frame. A claim in it is checked and answered; anything else it says is noted as
 * reported and kept as nothing, since the one speaking now did not assert it.
 */
function reports(runtime: Runtime, words: readonly Word[], pointed: string | undefined, message: string): Reading[] {
  const t = words.findIndex((w) => w.senses.some((s) => s.type === "takes" && s.reports));
  if (t < 0) return [];
  const who = (w: Word) => thingWord(w) || w.senses.some((s) => s.type === "entity" || s.type === "pointer");
  const before = words.slice(0, t);
  if (!before.every(who)) return [];
  const speakerSense = before[0]?.senses.find((s) => s.type === "entity" || s.type === "pointer");
  const speaker = c(speakerSense?.type === "entity" ? speakerSense.head : speakerSense?.type === "pointer" && pointed ? pointed : before.length ? named(before) : "Someone");
  const out: Reading[] = [];
  // Who it was told to, then maybe a "that", then what was said: every place the statement could
  // start is read, and the readings decide.
  for (let start = t + 1; start <= words.length - 2; start++) {
    const between = words.slice(t + 1, start);
    const marker = between.length > 0 && between[between.length - 1].senses.some((s) => s.type === "glue" && !s.copula);
    if (!(marker ? between.slice(0, -1) : between).every(who)) continue;
    const clause = words.slice(start);
    // Inside what was said, a pointing word is the one who said it: "he told me his name is Bob".
    const inner = [...computations(runtime, clause, false), ...statements(runtime, clause, false, isCall(speaker) && speaker.head !== "Someone" ? speaker.head : pointed, message)];
    out.push(...wrap(inner, start));
  }
  return out;

  function wrap(inner: Reading[], start: number): Reading[] {
    return inner
    .filter((r) => format(r.display).includes("Claimed(") || r.writes)
    .map((r) => {
      const said = isCall(r.display) && r.display.head === "ContextScope" ? r.display.args[1].value : r.display;
      return {
        key: `Reported ${r.key}`,
        features: ["read:reported", ...r.features],
        score: r.score + 1 + 0.5 * start,
        display: c("ContextScope", c("Declarative"), c("Reported", speaker, said)),
        chosen: r.chosen,
        // A claim is checked; a statement is only noted as said, never kept as true.
        run: r.writes ? async () => c("Noted", c("Reported", speaker, said)) : r.run,
      };
    });
  }
}

/**
 * "who is lily", "what is jaws": a question word, a word that says what something is, and one thing
 * the graph holds facts of, nothing else. Answered with what is known of it (Describes, worded by the
 * graph: "Lily is a doctor, older than you"). Who is speaking and who is spoken to ("who are you")
 * are left to what describes them.
 */
function describes(store: ConceptStore, words: readonly Word[], question: boolean): Reading[] {
  if (!asking(words, question)) return [];
  const content = words.filter((w) => !optional(w));
  if (content.length !== 1 || !words.some((w) => w.senses.some((s) => s.type === "glue" && s.copula))) return [];
  const sense = content[0].senses.find((s) => s.type === "entity");
  // A thing known only by what it is in words ("web app" Means ...) is described by that.
  const named = nameOf(content[0].text);
  // Someone met in talk (Gunter_1, Named "Gunter"): who they are to whoever holds them ("your
  // friend", "Tom's coworker"), from the facts that hold them.
  const met = findNamed(store, named);
  if (met.length === 1) {
    const held = store.asObject(met[0]!).filter((t) => t.context === undefined && !STRUCTURAL.has(t.predicate) && !store.retracted(t.subject, t.expr));
    const speaker = store.asSubject("I").find((t) => t.predicate === "HeardAs" && t.object !== undefined && isCall(t.object));
    const me = speaker?.object !== undefined && isCall(speaker.object) ? speaker.object.head : "Me";
    const whose = held.map((t) => (t.subject === me ? c("My", c(t.predicate)) : c("Whose", c(t.subject), c(t.predicate))));
    if (whose.length) {
      return [{
        key: `Who ${met[0]}`,
        features: ["read:who-met"],
        score: 6,
        display: c("ContextScope", c("Interrogative"), c("Describe", c(met[0]!))),
        chosen: [],
        notes: [`${content[0].text} is someone met in talk; who they are is what holds them.`],
        run: async () => c("Answer", whose.length === 1 ? whose[0]! : call("List", whose.map((value) => ({ value })))),
      }];
    }
  }
  const thing = sense && sense.type === "entity" ? sense.head : relationsOf(store, named).some((r) => r.context === undefined && isCall(r.claim) && r.claim.head === "Means") ? named : undefined;
  if (!thing || typesOf(store, c(named)).some((k) => k === "Deictic" || k === "Pronoun")) return [];
  // What it is (IsA, Means), then every fact it holds, as said: none taken back, none held only in a context.
  const known = relationsOf(store, thing).flatMap((r) =>
    r.context === undefined && isCall(r.claim) && r.claim.args.length && (r.claim.head === "IsA" || r.claim.head === "Means" || !STRUCTURAL.has(r.claim.head)) && !typesOf(store, c(r.claim.head)).includes("WordFact") && !store.retracted(thing, r.claim) ? [r.claim] : [],
  );
  // What the word can be ("can be a verb") is about the word, not the thing: alone, it is not a description.
  if (!known.length) return [];
  const facts = call("List", known.map((value) => ({ value })));
  return [{
    key: `Describes ${thing}`,
    features: ["read:describe"],
    score: 5,
    display: c("ContextScope", c("Interrogative"), c("Describe", c(thing))),
    chosen: [],
    notes: [`Everything known of ${thing.replace(/([a-z0-9])([A-Z])/g, "$1 $2")}: ${known.length} fact${known.length === 1 ? "" : "s"}.`],
    run: async () => c("Describes", c(thing), facts),
  }];
}

/**
 * "what time is it", "what is the date": a word that points at the moment (`IsA(Deictic())`) and
 * works out what it points at with nothing to fill (`Time()` runs), asked about: answered with what
 * it comes to. "It" said with it points at the same.
 */
function deictics(runtime: Runtime, words: readonly Word[], question: boolean): Reading[] {
  if (!asking(words, question)) return [];
  const store = runtime.store;
  const kinds = (w: Word) => typesOf(store, c(nameOf(w.text)));
  const content = words.filter((w) => !optional(w));
  const computes = (h: string) => typesOf(store, c(h)).includes("Deictic") && (store.get(h)?.realizations ?? []).some((r) => !r.retired && isCall(r.pattern) && r.pattern.head === h && !r.pattern.args.length && r.context !== undefined && isCall(r.context) && r.context.head === "Execution");
  const pointing = content.filter((w) => /^[a-z]+$/i.test(w.text) && computes(nameOf(w.text)));
  if (pointing.length !== 1 || content.some((w) => w !== pointing[0] && !kinds(w).some((k) => k === "Pronoun" || k === "Pointing"))) return [];
  const head = nameOf(pointing[0]!.text);
  return [{
    key: `Now ${head}`,
    features: ["read:deictic"],
    score: 5,
    display: c("ContextScope", c("Interrogative"), c(head)),
    chosen: [],
    notes: [`"${pointing[0]!.text}" points at the moment, worked out by ${head}.`],
    run: async () => {
      const v = await runtime.evaluate(c(head), c("Execution"));
      return isCall(v) && v.head === "Answer" ? v : c("Answer", v);
    },
  }];
}

/**
 * "hello", "thanks", "bye": a word that is itself something said, said whole. It is something
 * said when its Concept (or what it is a word for) is worded in speaking as itself, with nothing
 * to fill (`Realization(Hello(), context = Speaking(), ...)`): answered with it.
 */
function sayings(store: ConceptStore, words: readonly Word[], question = false): Reading[] {
  const content = words.filter((w) => !optional(w));
  const saidAs = (w: Word) =>
    /^[a-z]+$/i.test(w.text)
      ? chain(store, nameOf(w.text)).find((h) =>
          (store.get(h)?.realizations ?? []).some((r) => !r.retired && isCall(r.pattern) && r.pattern.head === h && !r.pattern.args.length && r.context !== undefined && isCall(r.context) && r.context.head === "Speaking"),
        )
      : undefined;
  // "when do you say hello?", "why do people say thanks": asked about saying it, it is told what it is.
  const saying = (w: Word) => /^[a-z]+$/i.test(w.text) && [nameOf(w.text), nameOf(lemma(w.text.toLowerCase()))].some((h) => chain(store, h).includes("Say"));
  const asked = content.length > 1 && asking(words, question) ? content[content.length - 1] : undefined;
  const about = asked ? saidAs(asked) : undefined;
  if (about && content.slice(0, -1).some(saying) && content.slice(0, -1).every((w) => saying(w) || typesOf(store, c(nameOf(w.text))).some((k) => k === "Pronoun" || k === "Pointing" || k === "Deictic" || k === "Person"))) {
    const known = relationsOf(store, about).flatMap((r) => (r.context === undefined && isCall(r.claim) && r.claim.head === "IsA" ? [r.claim] : []));
    if (!known.length) return [];
    return [{
      key: `Describes ${about}`,
      features: ["read:saying-about"],
      score: 5,
      display: c("ContextScope", c("Interrogative"), c("Describe", c(about))),
      chosen: [],
      notes: [`Asked about saying "${asked!.text}": what it is.`],
      // Named as the word said, in quotes: the word, not the saying of it.
      run: async () => call("Describes", [{ value: `"${asked!.text.toLowerCase()}"` }, { value: call("List", known.map((value) => ({ value }))) }]),
    }];
  }
  if (content.length !== 1) return [];
  const said = saidAs(content[0]!);
  if (!said) return [];
  return [{
    key: `Says ${said}`,
    features: ["read:saying"],
    score: 5,
    display: c(said),
    chosen: [],
    notes: [`"${content[0]!.text}" is something said: ${said}.`],
    run: async () => c("Answer", c(said)),
  }];
}

/**
 * "i live in phoenix", "i ate an apple", "my sister lives in denver": a thing (or whose thing), a
 * doing (the tagger's verb, not one that says what something is), maybe the word that marks what it
 * takes ("in"), and a thing or a value. Kept as a relation named by the doing's base form and that
 * word (LiveIn, Eat), replacing what was said before of the same, so the newest wins. Who is spoken
 * to and pointing words are not what a doing takes here ("i love you" is talk, not a fact).
 */
function doings(runtime: Runtime, words: readonly Word[], question: boolean, pointed: string | undefined, message: string, misses: Miss[] = []): Reading[] {
  if (asking(words, question) || words.length < 3) return [];
  const store = runtime.store;
  const tags = new Map(hostWords(message).map((w) => [w.text.toLowerCase(), w.tags]));
  const doing = (w: Word) =>
    (tags.get(w.text.toLowerCase()) ?? []).includes("Verb") && !w.senses.some((s) => (s.type === "glue" && s.copula) || s.type === "takes" || s.type === "op" || s.type === "question");
  const deictic = (w: Word) => typesOf(store, c(nameOf(w.text))).some((k) => k === "Deictic" || k === "Pronoun" || k === "Pointing");
  const out: Reading[] = [];
  // "bday means birthday": a word that says what a word means (`Mean Defines(WrittenAs())`) teaches
  // a reading of it, so "bday" is read as "birthday" from then on. One word on each side.
  words.forEach((w, v) => {
    if (v !== 1 || words.length !== 3 || !doing(w)) return;
    const verb = nameOf(lemma(w.text.toLowerCase()));
    const teaches = relationsOf(store, verb).some((r) => isCall(r.claim) && r.claim.head === "Defines" && isCall(r.claim.args[0]?.value) && (r.claim.args[0]!.value as { head: string }).head === "WrittenAs");
    if (!teaches) return;
    const typed = words[0]!.text.toLowerCase();
    const meant = words[2]!.text.toLowerCase();
    if (!/^[a-z']+$/.test(typed) || !/^[a-z']+$/.test(meant) || typed === meant) return;
    out.push({
      writes: true,
      key: `WrittenAs(${typed}, ${meant})`,
      features: ["read:defines"],
      score: 4 + 0.5 * words.length,
      display: c("ContextScope", c("Declarative"), c("WrittenAs", typed, meant)),
      chosen: [],
      notes: [`"${w.text}" says what a word means: "${typed}" is read as "${meant}" from now on.`],
      run: async () => {
        keepReading(store, typed, meant, 3);
        return c("Noted", c("WrittenAs", typed, meant));
      },
    });
  });
  words.forEach((w, v) => {
    if (v === 0 || !doing(w)) return;
    if (words.length === 3 && v === 1 && relationsOf(store, nameOf(lemma(w.text.toLowerCase()))).some((r) => isCall(r.claim) && r.claim.head === "Defines")) return;
    // Who does it: "i", a thing, or whose thing ("my sister", the thing); past a word that only
    // says how or when ("i just got promoted", the tagger's adverb with no sense here).
    const who = words.slice(0, v).filter((x) => !(x.senses.length === 0 && (tags.get(x.text.toLowerCase()) ?? []).includes("Adverb")));
    const self = who.length === 1 ? who[0].senses.find((s) => s.type === "entity") : undefined;
    const owned = who.length === 2 && who[0].senses.some((s) => s.type === "owner") && thingWord(who[1]) ? named([who[1]]) : undefined;
    // Or one pointed at ("she has the flu", after "my mom is sick").
    const pointer = who.length === 1 && pointed && who[0].senses.some((s) => s.type === "pointer") ? pointed : undefined;
    // Nobody to point at yet ("He bought a car.", the first thing said): the one it points at,
    // kept as the pointing word itself until it is named.
    const unpointed = who.length === 1 && !pointed && who[0].senses.some((s) => s.type === "pointer") ? nameOf(`${who[0].text} meant`) : undefined;
    const subject = self && self.type === "entity" ? self.head : owned ?? pointer ?? unpointed ?? (who.length === 1 && thingWord(who[0]) && !deictic(who[0]) ? named(who) : undefined);
    if (!subject) return;
    // What it takes: past one word that marks it ("in"), and the words that only help say it ("an").
    let at = v + 1;
    // A word that marks what it takes may have other senses ("in" also counts time); it has to be able to help.
    const mark = words[at] && words[at].senses.some((s) => s.type === "glue" && !s.copula && !/^(?:A|An|The|Month\d+)$/.test(s.head)) && !words[at].senses.some((s) => s.type === "value" || s.type === "entity") ? words[at] : undefined;
    if (mark) at += 1;
    while (at < words.length && only(words[at], "glue") && !words[at].senses.some((s) => s.type === "glue" && /^Month\d+$/.test(s.head))) at += 1;
    const object = words.slice(at);
    if (!object.length) return;
    const said = values(object).get(`0,${object.length}`)?.find((x) => !isCall(x.expr) || x.expr.head === "Date");
    // A count of things ("5 apples", "3 pairs of shorts"): how many, of what, kept as a quantity,
    // its unit as it was said (units/SpeakingQuantity.js says one in its base form).
    const count = !said && object.length >= 2 ? object[0]!.senses.find((s) => s.type === "value" && typeof s.value === "number") : undefined;
    const counted = count ? object.slice(1) : [];
    const value = said ?? (count && counted.length && counted.filter((x) => !only(x, "glue")).every((x) => thingWord(x) && !deictic(x)) && !only(counted[0]!, "glue") && count.type === "value"
      ? { expr: call("Quantity", [{ value: count.value }, { name: "unit", value: c(nameOf(counted.map((x) => x.text).join(" "))) }]) }
      : undefined);
    const things = object.every((x) => x.text === "," || x.senses.some((z) => z.type === "glue" && z.head === "And") || (thingWord(x) && !deictic(x)));
    if (!value && !things) {
      misses.push({ reading: c("Statement", c(subject), c(nameOf(lemma(w.text.toLowerCase())))), left: object.map((x) => x.text), kind: "fit" });
      return;
    }
    const relation = nameOf(`${lemma(w.text.toLowerCase())}${mark ? ` ${mark.text}` : ""}`);
    if (!/^[A-Z]/.test(relation)) return;
    // A run of things ("apples, pears and plums") is a list of them, not one thing so named.
    const run = separated(words.slice(at));
    const fact = c(relation, value ? value.expr : run.length > 1 ? call("List", run.map((p) => ({ value: c(named(p)) }))) : c(named(object)));
    out.push({
      writes: true,
      key: format(c(subject, fact)),
      features: ["read:doing"],
      score: 3 + 0.5 * words.length,
      display: c("ContextScope", c("Declarative"), c("Stated", c(subject), fact)),
      chosen: [],
      notes: [`"${w.text}" is a doing, kept as ${relation.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()}; what was said of it before is replaced.`],
      run: async () => {
        // Someone not named yet: one of what the word points at ("she": a person, female), so a
        // later "she" finds them and a later "he" does not.
        if (unpointed && !store.get(unpointed)?.relations.length) {
          store.addRelation(unpointed, c("IsA", c("Person")), undefined, runtime.trace.cause);
          for (const t of store.asSubject(nameOf(who[0]!.text))) if (t.predicate === "PointsAt" && t.object !== undefined && isCall(t.object) && t.object.head !== "Someone") store.addRelation(unpointed, c("SexOrGender", t.object), undefined, runtime.trace.cause);
        }
        for (const r of relationsOf(store, subject)) {
          if (r.context !== undefined || !isCall(r.claim) || r.claim.head !== relation || equal(r.claim, fact) || store.retracted(subject, r.claim)) continue;
          for (const st of r.stamps ?? []) store.addRelation(subject, c("Retracts", st.seq), undefined, runtime.trace.cause);
        }
        store.addRelation(subject, fact, undefined, runtime.trace.cause);
        return c("Noted", fact, c(subject));
      },
    });
  });
  return out;
}

/**
 * Doings kept for later: a word the graph says keeps what follows it (`Remember KeepsAs(ToDo())`,
 * "need", "have"), "to", a doing and what it is done to: "remember to buy milk", "i need to buy
 * eggs" keep ToDo(Buy(Milk())) of whoever is to do it (the one talking when no one is said). Asked
 * "what do i need to buy": what is kept so, of that doing.
 */
function todos(runtime: Runtime, words: readonly Word[], question: boolean, message: string): Reading[] {
  const store = runtime.store;
  const out: Reading[] = [];
  const tags = new Map(hostWords(message).map((w) => [w.text.toLowerCase(), w.tags]));
  const verb = (w: Word | undefined) => !!w && (tags.get(w.text.toLowerCase()) ?? []).some((t) => t === "Verb" || t === "Infinitive" || t === "Imperative");
  const keeps = (w: Word) => store.asSubject(nameOf(lemma(w.text.toLowerCase()))).find((t) => t.predicate === "KeepsAs" && t.object !== undefined && isCall(t.object));
  const isTo = (w: Word | undefined) => !!w && w.senses.some((s) => s.type === "glue" && s.head === "To");
  const speaker = (() => {
    const heard = store.asSubject("I").find((t) => t.predicate === "HeardAs" && t.object !== undefined && isCall(t.object));
    return heard?.object !== undefined && isCall(heard.object) ? heard.object.head : "Me";
  })();
  const k = words.findIndex((w, i) => i > 0 && isTo(w) && verb(words[i + 1]) && !!keeps(words[i - 1]!));
  if (k < 1) return out;
  const keeper = keeps(words[k - 1]!)!;
  const relation = keeper.object !== undefined && isCall(keeper.object) ? keeper.object.head : "ToDo";
  const doing = nameOf(lemma(words[k + 1]!.text.toLowerCase()));
  const who = words.slice(0, k - 1).filter((w) => !only(w, "glue") && !w.senses.some((s) => s.type === "question"));
  const self = who.length === 1 ? who[0]!.senses.find((s) => s.type === "entity") : undefined;
  const subject = who.length === 0 ? speaker : self?.type === "entity" ? self.head : who.length === 1 && thingWord(who[0]!) ? named(who) : undefined;
  if (!subject) return out;
  const object = words.slice(k + 2).filter((w) => !only(w, "glue"));
  if (asking(words, question)) {
    if (object.length) return out;
    // What is kept to do of that doing, newest first.
    const kept = relationsOf(store, subject).filter((r) => isCall(r.claim) && r.claim.head === relation && isCall(r.claim.args[0]?.value) && (r.claim.args[0]!.value as { head: string }).head === doing && !store.retracted(subject, r.claim));
    const what = kept.flatMap((r) => {
      const inner = isCall(r.claim) ? r.claim.args[0]?.value : undefined;
      return inner !== undefined && isCall(inner) ? inner.args.map((a) => a.value) : [];
    });
    if (!what.length) return out;
    out.push({
      key: format(c("Kept", c(subject), c(relation), c(doing))),
      features: ["read:todo-asked"],
      score: 4 + 0.5 * words.length,
      display: c("ContextScope", c("Interrogative"), c(relation, c(subject), c(doing))),
      chosen: [],
      notes: [`Kept to do: what ${doing.toLowerCase()} was said of.`],
      run: async () => c("Answer", what.length === 1 ? what[0]! : call("List", what.map((value) => ({ value })))),
    });
    return out;
  }
  if (!object.length || !object.every((w) => thingWord(w) || w.senses.some((s) => s.type === "value"))) return out;
  // A run of things ("apples, pears and plums"): each one to be done of, kept apart.
  const items = separated(words.slice(k + 2)).map((p) => values(p).get(`0,${p.length}`)?.find((x) => !isCall(x.expr))?.expr ?? c(named(p)));
  const facts = items.map((thing) => c(relation, c(doing, thing)));
  const fact = facts.length === 1 ? facts[0]! : call("List", facts.map((value) => ({ value })));
  out.push({
    writes: true,
    key: format(c(subject, fact)),
    features: ["read:todo"],
    score: 4 + 0.5 * words.length,
    display: c("ContextScope", c("Declarative"), c("Stated", c(subject), fact)),
    chosen: [],
    notes: [`"${words[k - 1]!.text} to" keeps what follows it to be done.`],
    run: async () => {
      for (const f of facts) store.addRelation(subject, f, undefined, runtime.trace.cause);
      return c("Noted", fact, c(subject));
    },
  });
  return out;
}

/**
 * Any row read by its words' holes (frame/compose.ts), with no shape of sentence assumed: what
 * the best way of filling the holes says is kept when told ("my car broke down": Car
 * BreakDown()), and answered when asked ("what did you buy", "who bought the car") from what is
 * held. Weighed under the readings made for one kind of message, which say more when they fit.
 */
function composed(runtime: Runtime, words: readonly Word[], question: boolean, message: string, pointed: string | undefined): Reading[] {
  const store = runtime.store;
  if (words.length < 2 || words.length > 24) return [];
  // Words only: marks and code ("(", "+", a fenced block) are read by what reads them.
  if (words.some((w) => !/[a-z0-9]/i.test(w.text) && !/^[,;]$/.test(w.text)) || message.includes("`")) return [];
  const tags = new Map(hostWords(message).map((w) => [w.text.toLowerCase().replace(/[.!?,]+$/, ""), w.tags]));
  const row = words.map((w, i) => piecesOf(w, i, tags.get(w.text.toLowerCase()) ?? [], pointed));
  const best = compose(store, row)[0];
  if (!best) return [];
  const root = best.piece;
  // A word that does something here (save, make, subtract, post) is done, not kept as said: its
  // own realization reads it, as the rules hearing hands it on.
  const doing = (p: Piece) => p.role === "ReadDoing" || p.role === "ReadAspect";
  const acts = (p: Piece, does: (head: string) => boolean): boolean => (doing(p) && (does(p.head) || does(nameOf(p.text)))) || p.fills.some((f) => acts(f.piece, does));
  // Only where it is asked to be done: no one said to do it ("save that"), or the one spoken to
  // asked if they can or will ("can you make a list"). Told or asked of what was done ("did you
  // get a nice tree?", "I got a car") is talk of the doing, read here.
  const doer = root.role === "ReadDoing" ? filled(root, "Doer")[0] : undefined;
  const toBeDone = root.role !== "ReadDoing" || !doer || (/^you$/i.test(doer.text) && filled(root, "Aspect").some((a) => /^(can|could|would|will|wo|should|please)$/i.test(a.text)));
  if (toBeDone && acts(root, (h) => reachesBehaviour(store, h))) return [];
  // A doing the graph says where what it takes is kept ("I need socks": `Need KeepsAs(ToDo())`)
  // is kept there, by whoever says it.
  if (acts(root, (h) => store.asSubject(h).some((t) => t.predicate === "KeepsAs"))) return [];
  // A message that starts with what can be done, not read as a doing, is told to be done ("take
  // 10, double it"), however its other words fall.
  const first = row[0]!;
  if (first.some(doing) && !(doing(root) && root.word === 0) && !root.fills.some((f) => doing(f.piece) && f.piece.word === 0)) return [];
  // A pointing word with nothing to point at ("that's wrong", said of the last reply) is not a thing to keep facts of.
  const unpointed = (p: Piece | undefined) => !!p && words[p.word]!.senses.some((s) => s.type === "pointer") && !pointed;
  const asked = question || asksIn(root);
  // Who or what a piece is, as the graph holds it: the one a word points at, the speaker, a thing.
  // Things joined ("socks and a charger") are a List of each.
  const who = (p: Piece | undefined): Expr | undefined => {
    if (p === undefined) return undefined;
    const also = filled(p, "Also").flatMap((j) => filled(j, "With"));
    if (!also.length) return thingOf(p);
    const own = thingOf({ ...p, fills: p.fills.filter((f) => f.hole !== "Also") });
    return call("List", [own, ...also.map((x) => who(x)!)].map((value) => ({ value })));
  };
  const doingName = (p: Piece) => nameOf([lemma(p.text.toLowerCase()) || p.text, ...filled(p, "Particle").map((x) => x.text)].join(" "));
  const mods = (p: Piece) => [
    ...filled(p, "Where").map((l) => {
      const what = filled(l, "What")[0];
      return { name: l.text.toLowerCase(), value: what ? (who(what) as Expr) : c(nameOf(l.text)) };
    }),
    ...filled(p, "When").map((t) => ({ name: "when", value: c(nameOf(t.text)) })),
  ];
  const negated = (p: Piece) => filled(p, "Not").length > 0;
  const base = 2 + 0.3 * words.length + 0.05 * best.score;
  const notes = [`Read by its words' holes: ${shapeSaid(root)}.`];
  // What was read says itself whether it was told or asked (Stated, Whether, a What in it): no wrapper says it again.
  const display = (e: Expr) => e;
  if (root.role === "ReadDoing") {
    const doer = filled(root, "Doer")[0];
    const done = filled(root, "Done")[0];
    const relation = doingName(root);
    if (!asked) {
      if (!doer || doer.ask || unpointed(doer)) return [];
      const subject = who(doer);
      if (!subject || !isCall(subject) || subject.args.length) return [];
      const claim = call(relation, [...(done ? [{ value: who(done)! }] : []), ...mods(root)]);
      const fact = negated(root) ? c("Not", claim) : claim;
      return [{
        writes: true,
        key: format(c(subject.head, fact)),
        features: ["read:composed", ...best.features],
        score: base,
        display: display(c("Stated", subject, fact)),
        chosen: [],
        notes,
        run: async () => {
          store.addRelation(subject.head, fact, undefined, runtime.trace.cause);
          return c("Noted", fact, subject);
        },
      }];
    }
    // Asked what was done: of the doer, what the doing was done to.
    if (done?.ask && doer && !doer.ask) {
      const subject = who(doer);
      if (!subject || !isCall(subject)) return [];
      const found = relationsOf(store, subject.head).filter((r) => r.context === undefined && isCall(r.claim) && r.claim.head === relation && r.claim.args[0] && !store.retracted(subject.head, r.claim)).flatMap((r) => (isCall(r.claim) && r.claim.args[0] ? [r.claim.args[0].value] : []));
      if (!found.length) return [];
      return [{ key: `Composed ${relation} of ${subject.head}`, features: ["read:composed-asked", ...best.features], score: base, display: display(c(relation, subject, c("What"))), chosen: [], notes, run: async () => c("Answer", found.length === 1 ? found[0]! : call("List", found.map((value) => ({ value })))) }];
    }
    // Asked who did it: whoever holds the doing done to that.
    if (doer?.ask && done && !done.ask) {
      const object = who(done);
      const found = store.triples().filter((t) => t.predicate === relation && t.context === undefined && (object === undefined || (isCall(t.expr) && t.expr.args[0] && equal(t.expr.args[0].value, object))) && !store.retracted(t.subject, t.expr)).map((t) => c(t.subject));
      if (!found.length) return [];
      return [{ key: `Composed who ${relation}`, features: ["read:composed-asked", ...best.features], score: base, display: display(c(relation, c("Who"), object ?? c("What"))), chosen: [], notes, run: async () => c("Answer", found.length === 1 ? found[0]! : call("List", found.map((value) => ({ value })))) }];
    }
    // Asked whether it was done ("did you get a nice tree?"): held, yes; else not known.
    if (doer && !doer.ask && !(done?.ask)) {
      const subject = who(doer);
      if (!subject || !isCall(subject)) return [];
      const object = done ? who(done) : undefined;
      const held = relationsOf(store, subject.head).some((r) => r.context === undefined && isCall(r.claim) && r.claim.head === relation && (object === undefined || (r.claim.args[0] !== undefined && equal(r.claim.args[0].value, object))) && !store.retracted(subject.head, r.claim));
      return [{ key: `Composed whether ${relation}`, features: ["read:composed-whether", ...best.features], score: base - 0.5, display: display(c("Whether", call(relation, [{ value: subject }, ...(object ? [{ value: object }] : [])]))), chosen: [], notes, run: async () => c("Answer", held ? c("True") : c("UnknownTruth")) }];
    }
    return [];
  }
  if (root.role === "ReadSame" && !asked) {
    const subjectPiece = filled(root, "Subject")[0];
    const said = filled(root, "Said")[0];
    if (!subjectPiece || !said || subjectPiece.ask || said.ask || unpointed(subjectPiece)) return [];
    const subject = who(subjectPiece);
    if (!subject || !isCall(subject) || subject.args.length) return [];
    let claim: Expr;
    if (said.role === "ReadQuality") claim = c("HasProperty", c(nameOf(said.text)));
    else if (said.role === "ReadDoing") claim = call(doingName(said), [...filled(said, "Done").map((d) => ({ value: who(d)! })), ...mods(said)]);
    else if (filled(said, "Determiner").some((d) => /^(a|an)$/i.test(d.text))) claim = c("IsA", who(said)!);
    else return [];
    const fact = negated(root) ? c("Not", claim) : claim;
    return [{
      writes: true,
      key: format(c(subject.head, fact)),
      features: ["read:composed", ...best.features],
      score: base,
      display: display(c("Stated", subject, fact)),
      chosen: [],
      notes,
      run: async () => {
        store.addRelation(subject.head, fact, undefined, runtime.trace.cause);
        return c("Noted", fact, subject);
      },
    }];
  }
  return [];
}

/** Readings that may fail on a row they cannot take: none, rather than none of the others either. */
function safely(read: () => Reading[]): Reading[] {
  try {
    return read();
  } catch (e) {
    if (process.env.NAPKIN_FRAMES_DEBUG) console.error("reading failed:", e);
    return [];
  }
}

/** A reading by holes, said: what took what. */
const shapeSaid = (p: Piece): string => `${p.text}${p.fills.length ? " (" + p.fills.map((f) => `${f.hole.toLowerCase()}: ${shapeSaid(f.piece)}`).join("; ") + ")" : ""}`;

/** Words parted by commas and "and", each part without the words that only help say it. */
function separated(ws: readonly Word[]): Word[][] {
  const parts: Word[][] = [[]];
  for (const w of ws) {
    if (w.text === "," || w.senses.some((x) => x.type === "glue" && x.head === "And")) parts.push([]);
    else if (!only(w, "glue")) parts[parts.length - 1]!.push(w);
  }
  return parts.filter((p) => p.length);
}

/** The words as one name: "favorite color" is FavoriteColor. */
const named = (ws: readonly Word[]) => nameOf(ws.map((w) => w.text).join(" "));
/** A word that names a thing: a thing the graph holds, a pointing word, or a word it has no sense for yet (a name it is told). */
const thingWord = (w: Word) => w.senses.length === 0 ? /^[a-z]+(?: [a-z]+)*$/i.test(w.text) : w.senses.some((s) => s.type === "entity" || s.type === "pointer" || s.type === "kind");

/**
 * Readings that tell: a word that says what something is ("is", "was", "am") with what it is
 * said of before it and what is said after. Whose and which relation ("my name", "tom's age") is
 * a fact of the owner, replacing what was said of it before; a thing and a kind ("jaws is a film")
 * is what it is; a thing, a comparing word and "than" ("tom is taller than ann") is a relation
 * between the two, named by those words. What does not fall into one of these is not read here.
 */
function statements(runtime: Runtime, words: readonly Word[], question: boolean, pointed: string | undefined, message: string, misses: Miss[] = []): Reading[] {
  if (asking(words, question)) return [];
  const store = runtime.store;
  const out: Reading[] = [];
  // "remember that ...": a word whose hole is a statement takes the rest as one.
  const taker = words[0]?.senses.find((s) => s.type === "takes" && !s.reports);
  const start = taker ? (words[1]?.senses.some((s) => s.type === "glue") ? 2 : 1) : 0;
  const body = words.slice(start);
  const tags = new Map(hostWords(message).map((w) => [w.text.toLowerCase(), w.tags]));
  const comparing = (w: Word) => (tags.get(w.text.toLowerCase()) ?? []).includes("Comparative");
  const glue = (w: Word) => only(w, "glue");
  if (process.env.NAPKIN_FRAMES_DEBUG) console.error("statement words", JSON.stringify(body.map((w) => [w.text, w.senses.map((x) => x.type)])));
  body.forEach((w, k) => {
    if (!w.senses.some((s) => s.type === "glue" && s.copula) || k === 0 || k === body.length - 1) return;
    // "my dog's name": an owner before another owner says whose that one is; the last is whose the fact is.
    const ownerAt = (ws: readonly Word[], i: number) => ws[i]?.senses.some((s) => s.type === "owner");
    const left = body.slice(0, k).filter((x) => !glue(x)).filter((x, i, ws) => !(ownerAt(ws, i) && ownerAt(ws, i + 1)));
    const rightAll = body.slice(k + 1);
    const right = rightAll.filter((x) => !glue(x));
    if (!left.length || !right.length) return;
    let subject: string | undefined;
    let claim: Expr | undefined;
    let replaces = false;
    // A name the fact holds that is someone: made an individual (Greg_1, Named "Greg") when kept.
    let someone: string | undefined;
    const nameLike = (x: Word) => !x.senses.some((s) => s.type === "pointer" || s.type === "owner" || s.type === "relation" || s.type === "kind") && (knownAsName(x.text) || relationsOf(store, nameOf(x.text)).some((r) => format(r.claim) === "IsA(Name())") || standsAsNameIn(message, x.text) || findNamed(store, nameOf(x.text)).length > 0);
    // Whose: a possessive ("my", "tom's"), or a pointing word before what is owned ("his name": the one pointed at).
    // "the capital of france": which, "of", whose. What is before "of" names the relation, what is after it the owner.
    const said = body.slice(0, k);
    const ofAt = said.findIndex((x) => x.senses.some((s) => s.type === "glue" && s.head === "Of"));
    const which = ofAt > 0 ? said.slice(0, ofAt).filter((x) => !glue(x)) : [];
    const whose = ofAt > 0 ? said.slice(ofAt + 1).filter((x) => !glue(x)) : [];
    const ofOwner = which.length && whose.length && which.every((x) => thingWord(x) || x.senses.some((s) => s.type === "relation")) && whose.every(thingWord)
      ? (() => {
          const named1 = whose.length === 1 ? whose[0].senses.find((s) => s.type === "entity" || s.type === "owner") : undefined;
          return { type: "owner" as const, head: named1 && (named1.type === "entity" || named1.type === "owner") ? named1.head : named(whose) };
        })()
      : undefined;
    const owner = left[0].senses.find((s) => s.type === "owner") ?? (left.length >= 2 && pointed && left[0].senses.some((s) => s.type === "pointer") ? { type: "owner" as const, head: pointed } : undefined) ?? ofOwner;
    const relationWords = owner === ofOwner && ofOwner ? which : left.slice(1);
    if (owner && relationWords.length >= 1 && (owner === ofOwner || left.length >= 2) && relationWords.every((x) => thingWord(x) || x.senses.some((s) => s.type === "relation"))) {
      // Whose, which: the value is a number or a date said, or what the words after name.
      // Past the words at its edges that only help say it ("the 12th of may").
      let a = 0;
      let b = rightAll.length;
      const edge = (w: Word) => glue(w) && !w.senses.some((x) => x.type === "glue" && /^Month\d+$/.test(x.head));
      while (a < b && edge(rightAll[a])) a++;
      while (b > a && edge(rightAll[b - 1])) b--;
      const spanning = values(rightAll.slice(a, b)).get(`0,${b - a}`)?.find((v) => !isCall(v.expr) || v.expr.head === "Date");
      if (!spanning && !right.every(thingWord)) return;
      // "my mom is sick", "my car is red": what is owned is a thing, said to be some way (the
      // tagger's adjective), not an attribute of the owner ("my name", "my favorite color", which
      // the graph calls a relation, or a word before it says which). Held by the thing.
      const tagged = (x: Word, t: string) => (tags.get(x.text.toLowerCase()) ?? []).includes(t);
      const attribute = relationWords.some((x) => x.senses.some((s) => s.type === "relation") || tagged(x, "Adjective"));
      if (!spanning && !attribute && owner !== ofOwner && right.every((x) => tagged(x, "Adjective"))) {
        subject = named(relationWords);
        claim = c("HasProperty", c(named(right)));
      } else {
        subject = owner.head;
        claim = c(named(relationWords), spanning ? spanning.expr : c(named(right)));
        replaces = true;
        // "my coworker is greg": someone, kept as an individual of their own, Named "Greg".
        // Not a name held as a name ("my name is Sam": Sam is what I am called, not someone).
        const naming = typesOf(store, c(named(relationWords))).includes("Name");
        if (!spanning && !naming && right.length === 1 && nameLike(right[0]!)) someone = named(right);
      }
    } else if (left.length === 1 && thingWord(left[0]) && right.length >= 2 && right[0]!.senses.some((s) => s.type === "owner") && right.slice(1).every((x) => thingWord(x) || x.senses.some((s) => s.type === "relation"))) {
      // "greg is my friend": whose (mine) and which (friend) said after who it is, a fact of the
      // owner holding them, someone kept as an individual of their own.
      const whose = right[0]!.senses.find((s) => s.type === "owner");
      if (whose?.type === "owner") {
        subject = whose.head;
        claim = c(named(right.slice(1)), c(named(left)));
        if (nameLike(left[0]!)) someone = named(left);
      }
    } else if (left.length === 1 && thingWord(left[0])) {
      const said = left[0].senses.find((s) => s.type === "entity" || s.type === "pointer");
      subject = said?.type === "entity" ? said.head : said?.type === "pointer" ? pointed : named(left);
      const than = right.findIndex((x) => x.text.toLowerCase() === "than" || x.senses.some((s) => s.type === "glue" && s.head === "Than"));
      if (right.length >= 3 && than === 1 && comparing(right[0]) && right.slice(2).every(thingWord)) {
        claim = c(nameOf(`${right[0].text} than`), c(named(right.slice(2))));
      } else if (right[0]?.senses.some((s) => s.type === "relation" && !s.inverse) && right.length >= 2) {
        // "i was born in 1990", "tom was born in paris": a word for a relation, then what it holds;
        // of the relations the word is for, the one that takes what was said (a year is a date).
        // Past the words that mark what it holds ("in", "on"), whatever else they can be.
        const after = rightAll.slice(rightAll.indexOf(right[0]!) + 1);
        const rest = after.slice(after.findIndex((x) => !x.senses.some((z) => z.type === "glue"))).filter((x) => !glue(x));
        const v = values(rest).get(`0,${rest.length}`)?.find((x) => !isCall(x.expr) || x.expr.head === "Date");
        const year = v && typeof v.expr === "number" && Number.isInteger(v.expr) && v.expr >= 1000 && v.expr <= 2999 ? call("Date", [{ name: "year", value: v.expr }]) : undefined;
        const held = year ?? v?.expr ?? (rest.length && rest.every(thingWord) ? c(named(rest)) : undefined);
        const kind = held === undefined ? undefined : isCall(held) && held.head === "Date" ? "Date" : typeof held === "number" ? "Number" : "Place";
        const takes = (r: string) => store.asSubject(r).filter((t) => t.predicate === "TakesValue" && t.object !== undefined && isCall(t.object)).map((t) => (t.object as { head: string }).head);
        const relations = right[0]!.senses.flatMap((s) => (s.type === "relation" && !s.inverse ? [s.head] : []));
        const relation = relations.find((r) => kind !== undefined && takes(r).includes(kind)) ?? (relations.length === 1 ? relations[0] : undefined);
        if (relation && held !== undefined) {
          claim = c(relation, held);
          replaces = true;
        }
      } else if (right.length === 1 && right[0]!.senses.some((s) => s.type === "value" && Number.isInteger(s.value)) && (said?.type === "entity" || relationsOf(store, named(left)).some((r) => format(r.claim) === "IsA(Name())") || (knownAsName(left[0]!.text) && standsAsNameIn(message, left[0]!.text)))) {
        // "tom is 30": a bare number said of someone is what the graph says such a number most
        // likely is (`Someone NumberIs(Age())`), kept as that and said so.
        const relation = store.asSubject("Someone").find((t) => t.predicate === "NumberIs" && t.object !== undefined && isCall(t.object));
        const value = right[0]!.senses.find((s) => s.type === "value");
        if (relation && value?.type === "value" && relation.object !== undefined && isCall(relation.object)) {
          claim = c(relation.object.head, value.value);
          replaces = true;
        }
      } else if (right.every((x) => thingWord(x) && !x.senses.some((s) => s.type === "pointer")) && rightAll.length > right.length && rightAll[0] !== undefined && /^(?:A|An|The)$/.test(rightAll[0].senses.find((s) => s.type === "glue")?.head ?? "")) {
        // "a film": a kind, said with a word that marks it as one of many.
        claim = c("IsA", c(named(right)));
      }
    }
    if (!subject || claim === undefined) {
      // A statement it could not hold: what it is about, or what is said of it, is not one thing.
      const whole = body.slice(0, k).filter((x) => !glue(x) || x.senses.some((s) => s.type === "glue" && s.head === "Of"));
      const unread = subject ? rightAll : body.slice(0, k);
      misses.push({ reading: c("Statement", c(named(whole)), c(named(right))), left: [unread.map((x) => x.text).join(" ")], kind: "thing" });
      return;
    }
    const told = claim;
    const holder = subject;
    const whom = someone;
    out.push({
      writes: true,
      key: format(c(holder, told)),
      features: ["read:statement"],
      score: 3 + 0.5 * body.length,
      display: c("ContextScope", c("Declarative"), c("Stated", c(holder), told)),
      chosen: [],
      run: async () => {
        // Someone named, as an individual: the one already Named so, or one made now.
        const id = whom === undefined ? undefined : (findNamed(store, whom)[0] ?? (() => {
          const made = store.mint(whom);
          store.addRelation(made, c("Named", whom), undefined, runtime.trace.cause);
          store.addRelation(made, c("IsA", c("Person")), undefined, runtime.trace.cause);
          return made;
        })());
        const swap = (e: Expr): Expr => (isCall(e) ? (e.head === whom && !e.args.length && id ? c(id) : call(e.head, e.args.map((a) => ({ ...a, value: swap(a.value) })))) : e);
        const fact = swap(told);
        // What is said now of whose and which takes back what was said of it before.
        if (replaces && isCall(fact)) {
          for (const r of relationsOf(store, holder)) {
            if (r.context !== undefined || !isCall(r.claim) || r.claim.head !== fact.head || equal(r.claim, fact) || store.retracted(holder, r.claim)) continue;
            for (const st of r.stamps ?? []) store.addRelation(holder, c("Retracts", st.seq), undefined, runtime.trace.cause);
          }
        }
        store.addRelation(holder, fact, undefined, runtime.trace.cause);
        // Who it was said of, kept in what is answered, so a pointing word next can find them.
        return taker ? c("Remembered", fact) : c("Noted", fact, c(holder));
      },
    });
  });
  return out;
}

/**
 * The thing a pointing word ("he", "she", "it") most likely means: the last answer the graph holds
 * facts of that is the kind the word points at (`She PointsAt(Someone()), PointsAt(Female())`): a
 * kind it is, or a value it holds (`Mom SexOrGender(Female())`). Never the ones talking (`Deictic`).
 */
function pointedAt(store: ConceptStore, history: readonly { result: string }[], kinds: readonly string[] = []): string | undefined {
  const fits = (head: string): boolean => {
    const types = typesOf(store, c(head));
    // Not the ones talking, and not a pointing word kept as the one it points at ("She ate an apple"
    // with nobody before it): its own PointsAt facts are what it points at, not what it is.
    if (types.includes("Deictic") || types.includes("Pointing")) return false;
    return kinds.every((k) => types.includes(k) || store.asSubject(head).some((t) => t.context === undefined && t.object !== undefined && isCall(t.object) && (t.object as { head: string }).head === k));
  };
  // What some pointing word points at ("Male" for "he"): a thing that is one of those, and not what
  // this word points at, is someone else. A thing the graph says neither of may still be meant.
  const pointable = new Set(store.triples().filter((t) => t.predicate === "PointsAt" && t.object !== undefined && isCall(t.object)).map((t) => (t.object as { head: string }).head));
  const contradicts = (head: string): boolean =>
    typesOf(store, c(head)).includes("Deictic") ||
    [...typesOf(store, c(head)), ...store.asSubject(head).filter((t) => t.context === undefined && t.object !== undefined && isCall(t.object)).map((t) => (t.object as { head: string }).head)].some((k) => pointable.has(k) && !kinds.includes(k));
  // A word that points at someone ("she") means someone: a name, a kind of person, one with a sex
  // or gender, a thing in the world (looked up), not a thing said only by its kind ("a car").
  const couldBeSomeone = (head: string): boolean => {
    const types = typesOf(store, c(head));
    if (types.includes("Pointing") || types.includes("Deictic")) return false;
    return types.some((k) => k === "Someone" || k === "Person" || k === "Name" || k === "Relative") || wikidataItem(store, head) !== undefined || store.asSubject(head).some((t) => t.predicate === "Named" || t.predicate === "SexOrGender");
  };
  const results = [...history].reverse().flatMap((h) => {
    try {
      return [parse(h.result)];
    } catch {
      return [];
    }
  });
  for (const r of results) for (const n of walk(r)) if (isCall(n) && holdsFacts(store, n.head) && fits(n.head)) return n.head;
  for (const h of [...history].reverse()) {
    try {
      // A thing known only by name, tied to its item ("Steven Spielberg", answered from Jaws), is
      // meant too: what it holds is looked up when it is asked about.
      for (const n of walk(parse(h.result))) if (isCall(n) && (holdsFacts(store, n.head) || wikidataItem(store, n.head) !== undefined || store.asSubject(n.head).some((t) => t.predicate === "Named")) && !contradicts(n.head) && (!kinds.includes("Someone") || couldBeSomeone(n.head))) return n.head;
    } catch {
      // A result that does not read as Concepts points at nothing.
    }
  }
  return undefined;
}

interface Option {
  readonly words: string[];
  /** Typed tokens it stands for: two when it joins this one and the next. */
  readonly span: 1 | 2;
  readonly cost: number;
  readonly edit?: Edit;
}

/** The message as tokens: words, numbers, and the symbols arithmetic is written with. */
function tokens(store: ConceptStore, message: string): { tokens: string[]; question: boolean } {
  const question = message.includes("?");
  const text = expandBare(message)
    .replace(/([+*/=×÷])/g, " $1 ")
    .replace(/(\d)\s*-\s*(\d)/g, "$1 - $2")
    // "what's", "he's": the word and "is", where the word asks or points (the graph says which).
    .replace(/\b([A-Za-z]+)'s\b/g, (all, w: string) => (typesOf(store, c(nameOf(w))).some((k) => k === "Interrogative" || k === "Pointing") ? `${w} is` : all));
  return { tokens: text.match(/\d+(?:st|nd|rd|th)\b|\d+(?:\.\d+)?|[A-Za-z]+(?:'[A-Za-z]+)?|[+*/=×÷(),-]/gi) ?? [], question };
}

/** Two or three words that are one name the graph holds ("steven spielberg" is StevenSpielberg). */
function fold(store: ConceptStore, words: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let taken = 1;
    for (const n of [3, 2]) {
      const part = words.slice(i, i + n);
      const whole = nameOf(part.join(" "));
      // Only into a thing the graph holds facts of: "is a" is not the relation IsA.
      // Into a thing the graph holds facts of, or a Concept that works something out ("square root"):
      // "is a" is not the relation IsA.
      // A code primitive (SquareRootOf) is the host's machinery, not what words name.
      const computes = (store.get(whole)?.realizations ?? []).some((r) => !r.retired && runs(r)) && !typesOf(store, c(whole)).includes("CodePrimitive");
      // Or a thing described ("web app" Means ...): what it is is known, if nothing else of it.
      const described = relationsOf(store, whole).some((r) => r.context === undefined && isCall(r.claim) && r.claim.head === "Means" && typeof r.claim.args[0]?.value === "string") && !(store.get(whole)?.realizations.length);
      if (part.length === n && part.every((w) => /^[A-Za-z]+$/.test(w)) && !STRUCTURAL.has(whole) && store.has(whole) && (holdsFacts(store, whole) || computes || described)) {
        taken = n;
        break;
      }
    }
    out.push(words.slice(i, i + taken).join(" "));
    i += taken - 1;
  }
  return out;
}

/** Where what the frames learned from feedback is kept: Confirmed(feature) and Corrected(feature), a stamp each time. */
const FRAMES = "Frames";
/** How much each confirmation or correction weighs, on a log scale: the first counts most. */
const LEARNED = 0.5;

/** The weight a feature has earned: confirmations count for it, corrections against it. */
export function weight(store: ConceptStore, feature: string): number {
  let confirmed = 0;
  let corrected = 0;
  for (const { identity, relation } of store.mentioning(feature)) {
    if (identity !== FRAMES || !isCall(relation.claim) || relation.claim.args[0]?.value !== feature) continue;
    if (relation.claim.head === "Confirmed") confirmed += relation.stamps?.length ?? 1;
    if (relation.claim.head === "Corrected") corrected += relation.stamps?.length ?? 1;
  }
  return LEARNED * (Math.log1p(confirmed) - Math.log1p(corrected));
}

/** Keep that a reading made of these choices was right (or wrong): each feature gets a stamp. */
export function feedback(store: ConceptStore, features: readonly string[], right: boolean, cause?: number): void {
  for (const f of new Set(features)) store.addRelation(FRAMES, c(right ? "Confirmed" : "Corrected", f), undefined, cause);
}

/** The choices the last message read by the frames was read with, when that message was this one. */
export function lastRead(store: ConceptStore, message: string): string[] {
  let newest: { seq: number; features: string[] } | undefined;
  for (const r of store.get(FRAMES)?.relations ?? []) {
    if (!isCall(r.claim) || r.claim.head !== "LastRead" || r.claim.args[0]?.value !== message) continue;
    const list = r.claim.args[1]?.value;
    const seq = Math.max(...(r.stamps ?? []).map((st) => st.seq));
    if (isCall(list) && (!newest || seq > newest.seq)) newest = { seq, features: list.args.map((a) => String(a.value)) };
  }
  return newest?.features ?? [];
}

const features = (reading: Reading, edits: readonly Edit[]) => [...reading.features, ...edits.map((e) => `spell:${e.typed}=${e.meant}`)];

const readableName = (head: string) => head.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

/**
 * Why a reading was taken, in plain words: each word read as another, the sense each word took,
 * what each operation or relation took into its holes, what feedback weighed for it, and the next
 * best reading with its score. What the studio shows beside the answer (design/frames.md).
 */
function explain(store: ConceptStore, reading: Reading, edits: readonly Edit[], score: number, next?: { reading: Reading; score: number }): string[] {
  const out: string[] = [];
  for (const e of edits) out.push(`"${e.typed}" read as "${e.meant}" (${e.kind === "learned" ? "as taught before" : e.kind === "join" ? "two words typed as one" : e.kind === "split" ? "one word typed as two" : "a slip"}).`);
  for (const f of reading.features) {
    const sense = /^sense:(.+)=(\w+)(~?)$/.exec(f);
    if (sense) out.push(`"${sense[1]}" taken as ${readableName(sense[2])}${sense[3] ? ", read from its other end" : ""}.`);
  }
  out.push(...(reading.notes ?? []));
  const body = isCall(reading.display) && reading.display.head === "ContextScope" ? reading.display.args[1].value : reading.display;
  // A thing by its name as words ("Steven Spielberg"); anything else as Concepts.
  const say = (e: Expr | undefined): string => (e !== undefined && isCall(e) && !e.args.length ? e.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2") : format(e ?? null));
  const holes = (e: Expr) => {
    for (const n of walk(e)) if (isCall(n) && n.args.length && !["Value", "Asked", "Stated", "Claimed", "Reported", "List", "Choose", "Picked", "Unfilled"].includes(n.head)) out.push(`${readableName(n.head)} took ${n.args.map((a) => say(a.value)).join(" and ")}.`);
  };
  if (isCall(body)) {
    const arg = (i: number) => body.args[i]?.value;
    if (body.head === "Value") holes(arg(0) ?? null);
    else if (body.head === "Claimed") {
      holes(body);
      out.push(`A claim that ${say(arg(0))} is ${say(arg(1))}: worked out and compared.`);
    } else if (body.head === "Asked") {
      const asked = arg(0);
      const part = body.args.find((a) => a.name === "part")?.value;
      if (isCall(asked ?? null) && asked !== undefined && isCall(asked)) {
        const [a, b] = asked.args.map((x) => x.value);
        const thing = isCall(a) && a.head !== "What" ? a : b;
        out.push(`Asked the ${readableName(asked.head)} of ${say(thing)}${isCall(a) && a.head === "What" ? ", read backwards: what holds it" : ""}${typeof part === "string" ? `, and its ${part}` : ""}.`);
      }
    } else if (body.head === "Stated") out.push(`Kept as a fact of ${say(arg(0))}: ${format(arg(1) ?? null)}.`);
    else if (body.head === "Reported") out.push(`Said by ${say(arg(0))}, read as its own statement, and kept as nothing true.`);
    else if (body.head === "Unfilled") out.push(`${format(arg(0) ?? null)} has a hole nothing filled: asked for.`);
  }
  const learned = features(reading, edits).reduce((sum, f) => sum + weight(store, f), 0);
  if (learned) out.push(`What earlier answers taught weighs ${learned > 0 ? "+" : ""}${learned.toFixed(2)} for it.`);
  if (next) out.push(`Next best: ${format(isCall(next.reading.display) && next.reading.display.head === "ContextScope" ? next.reading.display.args[1].value : next.reading.display)} (${next.score.toFixed(2)} against ${score.toFixed(2)}).`);
  else out.push("Nothing else read the words whole.");
  return out;
}

let namesAt = -1;

export interface FrameOptions {
  /**
   * Look a thing up in the world and keep what is found (Wikidata, by `groundInWikidata`).
   * Answers whether anything was learned. Absent, nothing is looked up.
   */
  /** `thing`: a word beside it asks a fact of it ("directed"), so it is a thing in the world, not a word to define. */
  readonly lookup?: (identity: string, said: string, thing?: boolean, asks?: readonly string[]) => Promise<boolean>;
  /** Most lookups in one turn. */
  readonly lookups?: number;
  /** The fixed readers too (sums, facts, statements, …), beside the one reader: for comparing with the old hearing only. */
  readonly fixed?: boolean;
  /** Reading one part of a message joined by "and": not split again. */
  readonly part?: boolean;
}

/** Where reading a message got stuck: the words it has nothing for, and the nearest reading with what it left over. */
export interface Stuck {
  readonly unknown: string[];
  readonly near?: { readonly said: string; readonly left: string[]; readonly kind: "fit" | "thing" };
}

/** The Concept expression a reading was, back in words: Times(10, 10) is "10 times 10", Asked(DateOfBirth(), Tom()) "the date of birth of Tom". */
function inWords(e: Expr): string {
  if (!isCall(e)) return String(e);
  const [a, b] = e.args.map((x) => x.value);
  if (e.head === "Asked" && a !== undefined && b !== undefined && isCall(a)) return `the ${readableName(a.head)} of ${inWords(b)}`;
  if (e.head === "Statement" && a !== undefined && b !== undefined) return `that ${inWords(a).toLowerCase()} is ${inWords(b).toLowerCase()}`;
  if (!e.args.length) return e.head.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  if (e.head === "Date") return e.args.map((x) => `${x.name ?? ""} ${format(x.value)}`.trim()).join(", ");
  if (e.args.length === 2 && a !== undefined && b !== undefined) return `${inWords(a)} ${readableName(e.head)} ${inWords(b)}`;
  if (e.args.length === 1 && a !== undefined) return `the ${readableName(e.head)} of ${inWords(a)}`;
  return format(e);
}

/** A thing looked up while reading, and what came of it. */
export interface Looked {
  readonly identity: string;
  readonly learned: boolean;
}

/**
 * Words of a question the graph holds nothing of, in runs: "steven spielberg" is one run, looked
 * up as one name before each word alone. A word the graph has any Concept for is not a run: it is
 * known, whatever the frames could make of it.
 */
function unknownRuns(store: ConceptStore, words: readonly Word[], message: string): string[][] {
  // Only a thing is looked up, not a doing or a describing word: the tagger says which (as it does for hearing).
  const tags = new Map(hostWords(message).map((w) => [w.text.toLowerCase(), w.tags]));
  const thing = (w: string) => w.toLowerCase().split(" ").every((x) => (tags.get(x) ?? ["Noun"]).some((t) => t === "Noun" || t === "ProperNoun") && !(tags.get(x) ?? []).includes("Verb"));
  const runs: string[][] = [];
  let run: string[] = [];
  // A word after "my" ("my bday") names something of the one talking, not a thing in the world:
  // never looked up.
  let owned = false;
  for (const w of words) {
    const after = owned;
    owned = w.senses.some((s) => s.type === "owner");
    const unknown = !after && !w.senses.length && /^[a-z]+$/i.test(w.text) && !store.has(nameOf(w.text)) && !store.has(nameOf(lemma(w.text.toLowerCase()))) && thing(w.text);
    if (unknown) run.push(w.text);
    else if (run.length) runs.push(run.splice(0));
  }
  if (run.length) runs.push(run);
  return runs;
}

/** A result still holding one of the operations it was built from: the computation did not run. */
function residual(result: Expr, ops: readonly string[]): boolean {
  // The operations it was built with (op:word=Target), not the lists that hold its values.
  const targets = new Set(ops.map((o) => o.slice(o.indexOf("=") + 1)));
  return [...walk(result)].some((n) => isCall(n) && targets.has(n.head));
}

/** What reading a message came to: the reading, when one accounts for every word, and what was looked up on the way. */
export interface FrameRead {
  readonly framed?: Framed;
  readonly looked: Looked[];
  /** When no reading accounted for every word: the words it has nothing for, and how near it came. */
  readonly stuck?: Stuck;
}

export async function frames(runtime: Runtime, message: string, history: readonly { result: string }[] = [], options: FrameOptions = {}): Promise<FrameRead> {
  const store = runtime.store;
  const { tokens: typed, question } = tokens(store, message);
  if (!typed.length || typed.length > 30) return { looked: [] };
  const numbers = new Map<string, number | undefined>();
  // Whether a word is a number word ("seven") is asked of the graph off the record: it is how
  // a word is looked at, not a step in answering, and every word of every message is asked.
  const offRecord = new Runtime(store, { traceQuiet: true });
  const number = async (w: string) => {
    if (!numbers.has(w)) {
      const v = await offRecord.evaluate(c("Number", w), c("Execution")).catch(() => undefined);
      numbers.set(w, typeof v === "number" ? v : undefined);
    }
    return numbers.get(w);
  };
  let senses = new Map<string, Sense[]>();
  const sensesFor = async (w: string) => {
    const key = w.toLowerCase();
    if (!senses.has(key)) {
      const name = nameOf(w);
      const owned = /^([A-Za-z]+)'s$/i.exec(w);
      // "3rd": the number. "june": a month, which a day beside it makes a date (values).
      const ordinal = /^(\d+)(?:st|nd|rd|th)$/i.exec(w);
      if (ordinal) {
        senses.set(key, [{ type: "value", value: Number(ordinal[1]) }]);
        return senses.get(key)!;
      }
      // A month's name keeps its other senses too: "may" also asks leave.
      const month = MONTHS[nameOf(w)];
      if (month !== undefined) {
        senses.set(key, [...(await sensesOf(store, w, number)), { type: "glue", head: `Month${month}`, marksFirst: false, copula: false }]);
        return senses.get(key)!;
      }
      // A comma parts what is said, as "and" does; it takes nothing and says nothing.
      if (w === ",") {
        senses.set(key, [{ type: "glue", head: "Comma", marksFirst: false, copula: false }]);
        return senses.get(key)!;
      }
      senses.set(
        key,
        // "tom's": whose, the name before the 's.
        // A name of several words is the thing it names, or what it computes ("square root of").
        owned ? [{ type: "owner", head: nameOf(owned[1]) }] : store.has(name) && w.includes(" ") && holdsFacts(store, name) ? [{ type: "entity", head: name }] : await sensesOf(store, w, number),
      );
    }
    return senses.get(key)!;
  };
  // What the message's pointing word points at, by the kinds it points at.
  const pointing = message.toLowerCase().split(/[^a-z']+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).find((w) => store.asSubject(w).some((t) => t.predicate === "PointsAt"));
  const pointsAt = pointing ? store.asSubject(pointing).filter((t) => t.predicate === "PointsAt" && t.object !== undefined && isCall(t.object)).map((t) => (t.object as { head: string }).head) : [];
  const pointed = pointedAt(store, history, pointsAt);
  // Ambient for the turn: what saying back the message ("she" is your mom) reads (packs/follows.ncon).
  if (pointed && pointing) runtime.context.set("pointed", `${pointing}=${pointed}`);
  else runtime.context.delete("pointed");

  /** Every reading of the message, as the graph stands now: the best, the best that means something else, and the words as typed. */
  const choose = async () => {
    // The graph's own names are words the speller knows, as hearing has them.
    if (store.size() !== namesAt) {
      useGraphNames(store.all().map((u) => u.identity));
      namesAt = store.size();
    }
    // What each typed token could have been: itself, what the user taught, and for a word that
    // has no sense at all, the words a slip away (frame readings weigh them all).
    const choices: Option[][] = [];
    for (let i = 0; i < typed.length; i++) {
      const raw = typed[i];
      const lower = raw.toLowerCase();
      const list: Option[] = [{ words: [raw], span: 1, cost: 0 }];
      for (const l of learnedReadings(store, lower)) {
        if (l.meant === lower) list[0] = { ...list[0], cost: -l.weight };
        else list.push({ words: l.meant.split(" "), span: 1, cost: -l.weight, edit: { typed: lower, meant: l.meant, kind: "learned" } });
      }
      // A name, typed on purpose: capitalised past the first word ("Rex").
      const name = i > 0 && /^[A-Z][a-z]/.test(raw);
      if (/^[a-z]+$/i.test(raw) && !name && !settled(raw) && !(await sensesFor(raw)).length) {
        for (const a of alternatives(raw, typed[i - 1] ?? "", typed[i + 1] ?? "").slice(0, 6)) {
          if (a.replaces === 2 && i + 1 >= typed.length) continue;
          // Less, the more often the word meant is written beside these neighbours than the one typed ("what is", not "was is").
          const prev = typed[i - 1] ?? "";
          const next = typed[i + 1] ?? "";
          const near = a.kind === "spelling" ? BESIDE * (beside(prev, a.text, next) - beside(prev, lower, next)) : 0;
          // A real word, however rarely written, was more likely meant than mistyped: reading it as another costs more.
          const cost = (a.kind === "spelling" ? Math.max(0.1, (COST * a.distance) / lower.length - a.common + commonness(lower) - near) : SPACE) + (isWord(lower) ? REAL : 0);
          const meant = unbare(a.text);
          list.push({ words: meant.split(" "), span: a.replaces, cost, edit: { typed: a.replaces === 2 ? `${lower} ${typed[i + 1].toLowerCase()}` : lower, meant, kind: a.kind } });
        }
      }
      choices.push(list);
    }
    // Every reading of the row, as far as MOST; the first is the words as typed.
    const rows: { words: string[]; cost: number; edits: Edit[] }[] = [];
    const walkRows = (i: number, words: string[], cost: number, edits: Edit[]) => {
      if (rows.length >= MOST) return;
      if (i >= typed.length) return void rows.push({ words, cost, edits });
      for (const o of choices[i]) walkRows(i + o.span, [...words, ...o.words], cost + o.cost, o.edit ? [...edits, o.edit] : edits);
    };
    walkRows(0, [], 0, []);
    type Ranked = { reading: Reading; row: (typeof rows)[number]; score: number; text: string };
    // The best reading of each meaning, so two that mean the same thing are not rivals.
    const byMeaning = new Map<string, Ranked>();
    let asTyped: Word[] = [];
    // Per reading of the row: the words it has nothing for, and how near it came.
    let stuckRow: { unknown: string[]; misses: Miss[]; cost: number } | undefined;
    for (const row of rows) {
      const folded = fold(store, row.words);
      const words: Word[] = [];
      for (const text of folded) words.push({ text, senses: await sensesFor(text) });
      if (row === rows[0]) asTyped = words;
      // Every word must say something the graph has a sense of.
      if (words.some((w) => !w.senses.length && !/^[a-z]+(?: [a-z]+)*$/i.test(w.text) && !/^[()]$/.test(w.text))) continue;
      // Brackets that do not pair are not read here.
      if (folded.filter((w) => w === "(").length !== folded.filter((w) => w === ")").length) continue;
      // Each kind of reading accounts for every word that says something, or is not made: a word
      // with no sense is used only where it names a part or a kind of a fact's answer.
      // How close this reading of the row came, for saying where it got stuck when nothing reads it whole.
      const near: Miss[] = [];
      // The one reader: what the words make of each other by their holes (frame/compose.ts). The
      // fixed readers only when asked for, to compare with the old hearing.
      const fixed = options.fixed ? [...computations(runtime, words, question, message, near), ...facts(store, words, question, pointed, near), ...statements(runtime, words, question, pointed, message, near), ...kindQuestions(store, words, pointed), ...reports(runtime, words, pointed, message), ...describes(store, words, question), ...sayings(store, words, question), ...deictics(runtime, words, question), ...doings(runtime, words, question, pointed, message, near), ...todos(runtime, words, question, message)] : [];
      const readings = [...fixed, ...safely(() => composed(runtime, words, question, message, pointed))];
      // Respelling a real word may answer a question, never tell the graph something.
      const respelled = row.edits.some((e) => e.kind !== "learned" && e.typed.split(" ").some((t) => isWord(t)));
      const unknownHere = words.filter((w) => !w.senses.length && /^[a-z]+$/i.test(w.text) && !store.has(nameOf(w.text)) && !store.has(nameOf(lemma(w.text.toLowerCase())))).map((w) => w.text);
      const leastLeft = (ms: Miss[]) => Math.min(Infinity, ...ms.filter((m) => m.left.length).map((m) => m.left.length));
      if (!stuckRow || unknownHere.length < stuckRow.unknown.length || (unknownHere.length === stuckRow.unknown.length && (leastLeft(near) < leastLeft(stuckRow.misses) || (leastLeft(near) === leastLeft(stuckRow.misses) && row.cost < stuckRow.cost)))) {
        stuckRow = { unknown: unknownHere, misses: near, cost: row.cost };
      }
      for (const reading of readings) {
        if (reading.writes && respelled) continue;
        // Teaching how a word is written is read only from the words as typed.
        if (reading.features.includes("read:defines") && row.edits.length) continue;
        // What the reading's choices have earned from feedback counts for or against it.
        const learned = features(reading, row.edits).reduce((sum, f) => sum + weight(store, f), 0);
        const score = reading.score - row.cost + learned;
        if (process.env.NAPKIN_FRAMES_DEBUG) console.error(" ", score.toFixed(2), folded.join(" "), format(reading.display), learned ? `(learned ${learned.toFixed(2)})` : "");
        const held = byMeaning.get(reading.key);
        if (!held || score > held.score) byMeaning.set(reading.key, { reading, row, score, text: folded.join(" ") });
      }
    }
    const ranked = [...byMeaning.values()].sort((a, b) => b.score - a.score);
    const [top, next] = ranked;
    // Two readings that fit as well and say different things are not chosen between by a guess.
    const clear = top !== undefined && (next === undefined || top.score - next.score >= MARGIN);
    // Close, both only answering (neither tells the graph anything): asked about.
    const close = !clear && top && next && !top.reading.writes && !next.reading.writes ? ranked.filter((r) => top.score - r.score < MARGIN).slice(0, 3) : undefined;
    const nearest = (stuckRow?.misses ?? []).filter((m) => m.left.length).sort((a, b) => a.left.length - b.left.length)[0];
    return { best: clear ? top : undefined, next: clear ? next : undefined, close, asTyped, nearest, unknown: stuckRow?.unknown ?? [] };
  };

  let { best, next, close, asTyped, nearest, unknown } = await choose();
  const looked: Looked[] = [];
  // Learn while reading. A question that no reading accounts for looks up, in turn: the things it
  // names that the graph knows only by name (no facts of their own), then the words it holds
  // nothing of (a run of them as one name before each word alone). After each find, the message is
  // read again, and the looking stops as soon as a reading accounts for every word.
  // Asked or told: a word nothing is held of is looked up while reading either way, so what is
  // told with a word not met yet is read whole once the word is known.
  if (!best && options.lookup) {
    const own = (id: string) => relationsOf(store, id).some((r) => r.context === undefined && isCall(r.claim) && !STRUCTURAL.has(r.claim.head) && r.claim.args.length > 0);
    const named = asTyped.flatMap((w) => w.senses.flatMap((x) => (x.type === "entity" ? [x.head] : x.type === "pointer" && pointed ? [pointed] : [])));
    const runs = unknownRuns(store, asTyped, message);
    // A phrase is one thing: quoted ("“web app”"), or nouns side by side that no reading took
    // together ("web app"), looked up whole before its words.
    const quoted = [...message.matchAll(/["“”']([^"“”']{2,40})["“”']/g)].map((m) => m[1]!.trim()).filter((q) => q.includes(" "));
    const tags = new Map(hostWords(message).map((w) => [w.text.toLowerCase(), w.tags]));
    const nounish = (w: Word) => /^[a-z]+$/i.test(w.text) && (tags.get(w.text.toLowerCase()) ?? []).includes("Noun") && !(tags.get(w.text.toLowerCase()) ?? []).some((t) => t === "Pronoun" || t === "Possessive") && !w.senses.some((s) => s.type === "glue" || s.type === "owner" || s.type === "question");
    const phrases: string[] = [...quoted];
    for (let i = 0; i < asTyped.length; i++) {
      let j = i;
      while (j < asTyped.length && j - i < 3 && nounish(asTyped[j]!)) j++;
      if (j - i >= 2) phrases.push(asTyped.slice(i, j).map((w) => w.text).join(" "));
      if (j > i) i = j - 1;
    }
    const whole = [...new Set(phrases.map((p) => nameOf(p)))].filter((id) => id && !own(id));
    const tries: string[][] = [
      ...whole.map((id) => [id]),
      // Never the ones talking ("me", "you"): the world does not know who they are.
      ...[...new Set(named)].filter((id) => !own(id) && !typesOf(store, c(id)).some((k) => k === "Deictic" || k === "Pronoun")).map((id) => [id]),
      ...(runs.length <= 2 && runs.every((r) => r.length <= 3) ? runs.flatMap((r) => (r.length > 1 ? [[nameOf(r.join(" "))], r.map((w) => nameOf(w))] : [[nameOf(r[0])]])) : []),
    ];
    let left = options.lookups ?? 3;
    for (const group of tries) {
      let found = false;
      for (const identity of group) {
        if (left <= 0 || looked.some((l) => l.identity === identity)) continue;
        left -= 1;
        const asksFact = asTyped.some((w) => w.senses.some((x) => x.type === "relation"));
        // "who is gunter": asked what it is as a kind (who asks someone, where a place), so an
        // answer of that kind; never a gunter rig. Only when the question is what it is.
        const copula = asTyped.some((w) => w.senses.some((x) => x.type === "glue" && x.copula));
        const asks = copula ? asTyped.flatMap((w) => w.senses.flatMap((x) => (x.type === "question" ? x.kinds : []))) : [];
        const learned = await options.lookup(identity, message, asksFact, asks).catch(() => false);
        looked.push({ identity, learned });
        found ||= learned;
      }
      if (!found) continue;
      senses = new Map();
      ({ best, next, close, asTyped, nearest, unknown } = await choose());
      if (best || left <= 0) break;
    }
  }
  // Two parts joined by "and", each read whole on its own, when the message as one is not: the
  // first is read, then the second, after it, so a word in it can point at the first's answer
  // ("who directed jaws and what year was he born"). "add 3 and 4" reads as one, so is not split.
  if (!best && !options.part) {
    for (let i = 2; i < typed.length - 1; i++) {
      if (!(await sensesFor(typed[i])).some((x) => x.type === "glue" && x.head === "And")) continue;
      const mark = question ? "?" : "";
      const left = await frames(runtime, typed.slice(0, i).join(" ") + mark, history, { ...options, part: true });
      if (!left.framed) continue;
      const right = await frames(runtime, typed.slice(i + 1).join(" ") + mark, [...history, { result: format(left.framed.result) }], { ...options, part: true });
      looked.push(...left.looked, ...right.looked);
      if (!right.framed) continue;
      const l = left.framed;
      const r = right.framed;
      return {
        framed: {
          display: c("Sequence", l.display, r.display),
          result: c("Sequence", l.result, r.result),
          text: `${l.text} and ${r.text}`,
          edits: [...l.edits, ...r.edits],
          chosen: [...l.chosen, ...r.chosen],
          why: [`Split at "and": each part read whole on its own.`, ...(l.why ?? []), ...(r.why ?? [])],
        },
        looked,
      };
    }
  }
  // Readings close enough that taking one would be a guess: asked, each said by what it would answer.
  if (!best && close && close.length > 1) {
    const offered: Expr[] = [];
    for (const r of close) {
      const answered = await r.reading.run();
      if (answered === undefined) continue;
      const value = isCall(answered) && answered.head === "Answer" ? answered.args[0]?.value : answered;
      if (value === undefined) continue;
      offered.push(call("Option", [{ value }, ...(r.reading.says ? [{ name: "says", value: r.reading.says }] : []), { name: "features", value: call("List", features(r.reading, r.row.edits).map((f) => ({ value: f }))) }]));
    }
    if (offered.length > 1 && new Set(offered.map(format)).size === offered.length) {
      const result = call("ChooseOne", offered.map((value) => ({ value })));
      const why = [`${close.length} readings fit nearly as well (${close.map((r) => r.score.toFixed(2)).join(", ")}), so which was meant is asked, not guessed.`, ...close.flatMap((r) => r.reading.notes ?? [])];
      return { framed: { why, display: c("ContextScope", c("Interrogative"), c("Choose", ...close.map((r) => (isCall(r.reading.display) && r.reading.display.head === "ContextScope" ? r.reading.display.args[1].value : r.reading.display)))), result, text: close[0].text, edits: [], chosen: [] }, looked };
    }
  }
  if (!best) {
    // Where it got stuck: the words it has nothing for, and the reading that came nearest.
    return { looked, stuck: { unknown, ...(nearest ? { near: { said: inWords(nearest.reading), left: [...nearest.left], kind: nearest.kind ?? "fit" } } : {}) } };
  }
  if (process.env.NAPKIN_FRAMES_DEBUG) console.error("best", best.score, format(best.reading.display));
  const result = await best.reading.run();
  if (result === undefined) return { looked };
  best.reading.learn?.();
  // How it was read, so "yes" or "no, ..." after it can confirm or correct those choices.
  if (!options.part) store.addRelation(FRAMES, c("LastRead", message, call("List", features(best.reading, best.row.edits).map((f) => ({ value: f })))), undefined, runtime.trace.cause);
  const why = [
    ...looked.map((l) => `${l.identity} ${l.learned ? "was looked up and kept" : "was looked up and not found"}.`),
    ...explain(store, best.reading, best.row.edits, best.score, next),
  ];
  return { framed: { display: best.reading.display, result, text: best.text, edits: best.row.edits, chosen: best.reading.chosen, why }, looked };
}

/**
 * The answer to "do you mean A or B?": the option the reply's words point at, by what it answers
 * or what it is about ("the company" points at RanCompany). Undefined unless exactly one does.
 */
export function pickOption(store: ConceptStore, asked: string, reply: string): { value: Expr; features: string[]; others: string[][]; framed: Framed } | undefined {
  let question: Expr;
  try {
    question = parse(asked);
  } catch {
    return undefined;
  }
  if (!isCall(question) || question.head !== "ChooseOne") return undefined;
  const said = (reply.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !typesOf(store, c(nameOf(w))).some((k) => k === "Determiner" || k === "Preposition" || k === "Helper"));
  const options = question.args.map((a) => a.value).filter(isCall).map((o) => {
    const value = o.args[0]?.value;
    const says = o.args.find((a) => a.name === "says")?.value;
    const list = o.args.find((a) => a.name === "features")?.value;
    const words = [
      ...(value !== undefined && isCall(value) ? wordsOf(value.head) : [String(value).toLowerCase()]),
      ...(says !== undefined && isCall(says) ? [...wordsOf(says.head), ...called(store, says.head)] : []),
    ];
    return { value: value as Expr, features: list !== undefined && isCall(list) ? list.args.map((a) => String(a.value)) : [], words };
  });
  const hit = options.filter((o) => said.some((w) => o.words.some((x) => akin(x, w))));
  if (hit.length !== 1) return undefined;
  const value = hit[0].value;
  return {
    value,
    features: hit[0].features,
    others: options.filter((o) => o !== hit[0]).map((o) => o.features),
    framed: { display: c("ContextScope", c("Declarative"), c("Picked", value)), result: c("Answer", value), text: reply, edits: [], chosen: [] },
  };
}

/** A reply that agrees ("yes", "ok", "thanks") or refuses ("no", "nope"), by the kinds the graph gives its first word. */
export function reaction(store: ConceptStore, message: string): "agree" | "refuse" | undefined {
  const first = (message.toLowerCase().match(/[a-z]+/) ?? [])[0];
  if (!first) return undefined;
  const kinds = typesOf(store, c(nameOf(first)));
  return kinds.includes("Agreement") || kinds.includes("Thanking") ? "agree" : kinds.includes("Refusal") ? "refuse" : undefined;
}

/** Where reading got stuck, as the Concept that says it (packs/frames.ncon, Speaking). */
export function stuckResult(stuck: Stuck): Expr {
  const list = (ws: readonly string[]) => call("List", ws.map((value) => ({ value })));
  return call("Stuck", [
    ...(stuck.near ? [{ name: "near", value: stuck.near.said }, { name: "left", value: list(stuck.near.left) }, { name: "as", value: stuck.near.kind }] : []),
    { name: "unknown", value: list(stuck.unknown) },
  ]);
}
