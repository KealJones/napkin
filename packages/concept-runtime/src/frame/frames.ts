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
import { type Expr, c, call, equal, format, isCall, parse, walk } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words as hostWords } from "../runtime/host.js";
import { alternatives, beside, commonness, expandBare, isWord, settled, unbare, useGraphNames } from "../ears/parser/words.js";
import type { Runtime } from "../runtime/evaluator.js";
import { typesOf } from "../runtime/types.js";
import { UNIVERSAL } from "../runtime/select.js";
import type { ConceptStore } from "../store/store.js";
import { learnedReadings } from "../resolve/learned.js";
import type { Edit } from "../resolve/readings.js";
import { akin, called, holdsFacts, sensesOf, STRUCTURAL, wordsOf, type Sense } from "./senses.js";

export interface Framed {
  /** What was read, as Concepts: for showing, not for running. */
  readonly display: Expr;
  readonly result: Expr;
  /** The words as read. */
  readonly text: string;
  readonly edits: Edit[];
  /** Each word that had more than one sense, and the one taken. */
  readonly chosen: { word: string; sense: string }[];
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
  /** The words as said: the Concepts the words are. */
  readonly said: Expr;
  readonly score: number;
  /** How tightly its outermost operation binds; Infinity when it is closed (a value, or a prefix form). */
  readonly binds: number;
}

/** What it costs to read a word as another: by the share of it changed, less how much more common the other is. */
const COST = 3;
const SPACE = 0.5;
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
  const n = words.length;
  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len;
      // Brackets close what they hold: "(2+3)*4" adds first.
      if (len >= 3 && words[i].text === "(" && words[j - 1].text === ")") for (const inner of get(i + 1, j - 1)) put({ ...inner, i, j, binds: Infinity });
      // Infix: a value, the operation, maybe a word that helps say it ("divided by"), a value.
      for (let k = i + 1; k < j - 1; k++) {
        for (const op of words[k].senses) {
          if (op.type !== "op") continue;
          for (const skip of [0, 1]) {
            const r0 = k + 1 + skip;
            if (r0 >= j || (skip && !only(words[k + 1], "glue"))) continue;
            for (const L of get(i, k)) {
              for (const R of get(r0, j)) {
                // Which operation takes its neighbour first is the graph's: Binds(120) before Binds(110).
                let penalty = 0;
                if (L.binds < op.binds || (L.binds === op.binds && op.right)) penalty += 1;
                if (R.binds < op.binds || (R.binds === op.binds && !op.right)) penalty += 1;
                put({ i, j, expr: c(op.target, L.expr, R.expr), said: c(op.word, L.said, R.said), score: L.score + R.score + 2 + typedFit(op) - penalty - 0.1 * skip, binds: op.binds });
              }
            }
          }
        }
      }
      // Prefix: the operation, a value, a joining word ("and", or "from", which puts what follows it first), a value.
      for (const op of words[i].senses) {
        if (op.type !== "op") continue;
        for (let m = i + 2; m < j; m++) {
          const glue = words[m].senses.find((s) => s.type === "glue");
          for (const X of get(i + 1, m)) {
            for (const Y of get(glue ? m + 1 : m, j)) {
              const first = glue?.type === "glue" && glue.marksFirst;
              const [a, b] = first ? [Y, X] : [X, Y];
              put({ i, j, expr: c(op.target, a.expr, b.expr), said: c(op.word, a.said, b.said), score: X.score + Y.score + 2 + typedFit(op) - (glue ? 0.1 : 0), binds: Infinity });
            }
          }
        }
      }
    }
  }
  return at;
}

interface Reading {
  /** It changes the graph (a statement kept): read only from words as typed, or from slips of non-words. */
  readonly writes?: boolean;
  readonly score: number;
  /** What it means, for telling two readings apart: what runs, or what is asked of the graph. */
  readonly key: string;
  readonly display: Expr;
  readonly run: () => Promise<Expr | undefined>;
  readonly chosen: { word: string; sense: string }[];
  readonly learn?: () => void;
}

/** Asked: a "?", a question word, or a word that says what something is put first ("is tom taller than ann"). */
const asking = (words: readonly Word[], question: boolean) =>
  question || words.some((w) => is(w, "question")) || (words.length > 1 && words[0].senses.some((s) => s.type === "glue" && s.copula));
const outsideOptional = (words: readonly Word[], i: number, j: number) => words.every((w, k) => (k >= i && k < j) || optional(w));

/** Readings that work something out: a value asked for, a claim about one, an operation missing a value. */
function computations(runtime: Runtime, words: readonly Word[], question: boolean): Reading[] {
  const items = values(words);
  const out: Reading[] = [];
  const mood = c(asking(words, question) ? "Interrogative" : "Declarative");
  for (const list of items.values()) {
    for (const item of list) {
      // A value asked for: the item covers every word but those that only help say it.
      if (item.binds !== Infinity || isCall(item.expr)) {
        if (outsideOptional(words, item.i, item.j) && (isCall(item.expr) || asking(words, question))) {
          out.push({
            key: format(item.expr),
            score: item.score + 2,
            display: c("ContextScope", mood, c("Value", item.said)),
            chosen: [],
            // A question is answered; a doing asked for ("subtract 3 from 10") gives what it comes to.
            run: async () => {
              const v = await runtime.evaluate(item.expr, c("Execution"));
              return !asking(words, question) || (isCall(v) && v.head === "Answer") ? v : c("Answer", v);
            },
          });
        }
      }
    }
  }
  // A claim: a value, a word that says what it is ("is", "was"), another value.
  words.forEach((w, k) => {
    if (!w.senses.some((s) => s.type === "glue" && s.copula)) return;
    for (let i = 0; i < k; i++) {
      for (const A of items.get(`${i},${k}`) ?? []) {
        for (let j = k + 2; j <= words.length; j++) {
          for (const B of items.get(`${k + 1},${j}`) ?? []) {
            if (!outsideOptional(words, i, j) || (!isCall(A.expr) && !isCall(B.expr))) continue;
            out.push({
              key: format(c("Claimed", A.expr, B.expr)),
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
      if (op.type !== "op") continue;
      for (let i = 0; i < k; i++) {
        for (const L of items.get(`${i},${k}`) ?? []) {
          if (!outsideOptional(words, i, k + 1) || words.slice(k + 1).some((x) => !optional(x))) continue;
          const said = words.slice(i, k + 1).map((x) => x.text).join(" ");
          out.push({
            key: format(c("Unfilled", c(op.target, L.expr))),
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
function facts(store: ConceptStore, words: readonly Word[], question: boolean, pointed: string | undefined): Reading[] {
  if (!asking(words, question)) return [];
  const out: Reading[] = [];
  const asks = words.flatMap((w) => w.senses.flatMap((s) => (s.type === "question" ? s.asks : [])));
  const things = words.flatMap((w, k) =>
    w.senses.flatMap((s) => (s.type === "entity" || s.type === "owner" ? [{ k, head: s.head }] : s.type === "pointer" && pointed ? [{ k, head: pointed }] : [])),
  );
  const relations = words.flatMap((w, k) => w.senses.flatMap((s) => (s.type === "relation" ? [{ k, head: s.head }] : [])));
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
      for (const [direction, found] of [["of", forward], ["holding", inverse]] as const) {
        if (!found.length) continue;
        let answers: Expr[] = found;
        let part: string | undefined;
        let score = 4;
        let unused = 0;
        // "is tom taller than ann": the other thing named, said after the relation, is among the answers: yes.
        let yes = false;
        const used: string[] = [];
        words.forEach((w, k) => {
          if (k === thing.k || k === rel.k || optional(w)) return;
          // "my dog's": an owner word that says whose the thing named next is.
          if (w.senses.some((s) => s.type === "owner") && k + 1 === thing.k && words[thing.k].senses.some((s) => s.type === "owner")) return void used.push(w.text);
          const other = w.senses.find((s) => s.type === "entity" && answers.some((a) => isCall(a) && a.head === s.head));
          // Only read forwards: the thing named first holds the relation to the one named after.
          if (other && direction === "of" && thing.k < rel.k && k > rel.k) {
            yes = true;
            score += 2;
            return void used.push(w.text);
          }
          // Another word for the same relation ("directed ... direct") says nothing more.
          if (w.senses.some((s) => s.type === "relation" && s.head === rel.head)) return void used.push(w.text);
          // A word for the kind of thing asked: only answers of that kind.
          const kinds = w.senses.flatMap((s) => (s.type === "kind" ? [s.head] : []));
          // Its kinds, not its own name: "tom" is not a kind Tom is of.
          const ofKind = answers.filter((a) => typesOf(store, a).slice(1).some((t) => kinds.includes(t) || [...wordsOf(t), ...called(store, t)].some((x) => akin(x, w.text.toLowerCase()))));
          if (ofKind.length) {
            answers = ofKind;
            score += 2;
            return void used.push(w.text);
          }
          // A word naming a part of the value: that part is the answer ("year" of a date).
          const lower = w.text.toLowerCase();
          const parted = answers.every((a) => isCall(a) && a.args.some((x) => x.name !== undefined && akin(x.name, lower)));
          if (parted && answers.length) {
            part = answers[0] && isCall(answers[0]) ? answers[0].args.find((x) => x.name !== undefined && akin(x.name, lower))?.name : undefined;
            score += 2;
            return void used.push(w.text);
          }
          unused += 1;
        });
        if (unused) continue;
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
          score,
          display: c("ContextScope", c("Interrogative"), part ? call("Asked", [{ value: asked }, { name: "part", value: part }]) : c("Asked", asked)),
          chosen: senses > 1 ? [{ word: relWord, sense: rel.head }] : [],
          run: async () => c("Answer", answer),
          learn: senses > 1 ? () => neighbours.forEach((b) => store.addRelation(rel.head, c("ReadBeside", relWord, b))) : undefined,
        });
      }
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
  return [{ key: "True()", score: 6, display: c("ContextScope", c("Interrogative"), c("Asked", c("IsA", c(thing), c(kind)))), chosen: [], run: async () => c("Answer", c("True")) }];
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
function statements(runtime: Runtime, words: readonly Word[], question: boolean, pointed: string | undefined, message: string): Reading[] {
  if (asking(words, question)) return [];
  const store = runtime.store;
  const out: Reading[] = [];
  // "remember that ...": a word whose hole is a statement takes the rest as one.
  const taker = words[0]?.senses.find((s) => s.type === "takes");
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
    const owner = left[0].senses.find((s) => s.type === "owner");
    if (owner && left.length >= 2 && left.slice(1).every((x) => thingWord(x) || x.senses.some((s) => s.type === "relation"))) {
      // Whose, which: the value is a number said, or what the words after name.
      const value = right.length === 1 ? right[0].senses.find((s) => s.type === "value") : undefined;
      if (!value && !right.every(thingWord)) return;
      subject = owner.head;
      claim = c(named(left.slice(1)), value && value.type === "value" ? value.value : c(named(right)));
      replaces = true;
    } else if (left.length === 1 && thingWord(left[0])) {
      const said = left[0].senses.find((s) => s.type === "entity" || s.type === "pointer");
      subject = said?.type === "entity" ? said.head : said?.type === "pointer" ? pointed : named(left);
      const than = right.findIndex((x) => x.text.toLowerCase() === "than" || x.senses.some((s) => s.type === "glue" && s.head === "Than"));
      if (right.length >= 3 && than === 1 && comparing(right[0]) && right.slice(2).every(thingWord)) {
        claim = c(nameOf(`${right[0].text} than`), c(named(right.slice(2))));
      } else if (right.every((x) => thingWord(x) && !x.senses.some((s) => s.type === "pointer")) && rightAll.length > right.length) {
        // "a film": a kind, said with a word that marks it as one of many.
        claim = c("IsA", c(named(right)));
      }
    }
    if (!subject || claim === undefined) return;
    const fact = claim;
    const holder = subject;
    out.push({
      writes: true,
      key: format(c(holder, fact)),
      score: 3 + 0.5 * body.length,
      display: c("ContextScope", c("Declarative"), c("Stated", c(holder), fact)),
      chosen: [],
      run: async () => {
        // What is said now of whose and which takes back what was said of it before.
        if (replaces && isCall(fact)) {
          for (const r of relationsOf(store, holder)) {
            if (r.context !== undefined || !isCall(r.claim) || r.claim.head !== fact.head || equal(r.claim, fact) || store.retracted(holder, r.claim)) continue;
            for (const st of r.stamps ?? []) store.addRelation(holder, c("Retracts", st.seq), undefined, runtime.trace.cause);
          }
        }
        store.addRelation(holder, fact, undefined, runtime.trace.cause);
        return taker ? c("Remembered", fact) : c("Noted", fact);
      },
    });
  });
  return out;
}

/** The thing a pointing word ("he", "it") most likely means: the last answer the graph holds facts of. */
function pointedAt(store: ConceptStore, history: readonly { result: string }[]): string | undefined {
  for (const h of [...history].reverse()) {
    try {
      for (const n of walk(parse(h.result))) if (isCall(n) && holdsFacts(store, n.head)) return n.head;
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
  return { tokens: text.match(/\d+(?:\.\d+)?|[A-Za-z]+(?:'[A-Za-z]+)?|[+*/=×÷()-]/g) ?? [], question };
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
      if (part.length === n && part.every((w) => /^[A-Za-z]+$/.test(w)) && !STRUCTURAL.has(whole) && store.has(whole) && holdsFacts(store, whole)) {
        taken = n;
        break;
      }
    }
    out.push(words.slice(i, i + taken).join(" "));
    i += taken - 1;
  }
  return out;
}

let namesAt = -1;

export interface FrameOptions {
  /**
   * Look a thing up in the world and keep what is found (Wikidata, by `groundInWikidata`).
   * Answers whether anything was learned. Absent, nothing is looked up.
   */
  readonly lookup?: (identity: string, said: string) => Promise<boolean>;
  /** Most lookups in one turn. */
  readonly lookups?: number;
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
  for (const w of words) {
    const unknown = !w.senses.length && /^[a-z]+$/i.test(w.text) && !store.has(nameOf(w.text)) && !store.has(nameOf(lemma(w.text.toLowerCase()))) && thing(w.text);
    if (unknown) run.push(w.text);
    else if (run.length) runs.push(run.splice(0));
  }
  if (run.length) runs.push(run);
  return runs;
}

/** What reading a message came to: the reading, when one accounts for every word, and what was looked up on the way. */
export interface FrameRead {
  readonly framed?: Framed;
  readonly looked: Looked[];
}

export async function frames(runtime: Runtime, message: string, history: readonly { result: string }[] = [], options: FrameOptions = {}): Promise<FrameRead> {
  const store = runtime.store;
  const { tokens: typed, question } = tokens(store, message);
  if (!typed.length || typed.length > 24) return { looked: [] };
  const numbers = new Map<string, number | undefined>();
  const number = async (w: string) => {
    if (!numbers.has(w)) {
      const v = await runtime.evaluate(c("Number", w), c("Execution")).catch(() => undefined);
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
      senses.set(
        key,
        // "tom's": whose, the name before the 's.
        owned ? [{ type: "owner", head: nameOf(owned[1]) }] : store.has(name) && w.includes(" ") ? (holdsFacts(store, name) ? [{ type: "entity", head: name }] : []) : await sensesOf(store, w, number),
      );
    }
    return senses.get(key)!;
  };
  const pointed = pointedAt(store, history);

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
    let best: { reading: Reading; row: (typeof rows)[number]; score: number; text: string } | undefined;
    let rival = -Infinity;
    let asTyped: Word[] = [];
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
      const readings = [...computations(runtime, words, question), ...facts(store, words, question, pointed), ...statements(runtime, words, question, pointed, message), ...kindQuestions(store, words, pointed)];
      // Respelling a real word may answer a question, never tell the graph something.
      const respelled = row.edits.some((e) => e.kind !== "learned" && e.typed.split(" ").some((t) => isWord(t)));
      for (const reading of readings) {
        if (reading.writes && respelled) continue;
        const score = reading.score - row.cost;
        if (process.env.NAPKIN_FRAMES_DEBUG) console.error(" ", score.toFixed(2), folded.join(" "), format(reading.display));
        if (!best || score > best.score) {
          if (best && best.reading.key !== reading.key) rival = Math.max(rival, best.score);
          best = { reading, row, score, text: folded.join(" ") };
        } else if (best.reading.key !== reading.key) rival = Math.max(rival, score);
      }
    }
    // Two readings that fit as well and say different things: not chosen between by a guess.
    const clear = best !== undefined && (rival === -Infinity || best.score - rival >= 0.5);
    return { best: clear ? best : undefined, asTyped };
  };

  let { best, asTyped } = await choose();
  const looked: Looked[] = [];
  // Learn while reading. A question that no reading accounts for looks up, in turn: the things it
  // names that the graph knows only by name (no facts of their own), then the words it holds
  // nothing of (a run of them as one name before each word alone). After each find, the message is
  // read again, and the looking stops as soon as a reading accounts for every word.
  if (!best && options.lookup && asking(asTyped, question)) {
    const own = (id: string) => relationsOf(store, id).some((r) => r.context === undefined && isCall(r.claim) && !STRUCTURAL.has(r.claim.head) && r.claim.args.length > 0);
    const named = asTyped.flatMap((w) => w.senses.flatMap((x) => (x.type === "entity" ? [x.head] : x.type === "pointer" && pointed ? [pointed] : [])));
    const runs = unknownRuns(store, asTyped, message);
    const tries: string[][] = [
      ...[...new Set(named)].filter((id) => !own(id)).map((id) => [id]),
      ...(runs.length <= 2 && runs.every((r) => r.length <= 3) ? runs.flatMap((r) => (r.length > 1 ? [[nameOf(r.join(" "))], r.map((w) => nameOf(w))] : [[nameOf(r[0])]])) : []),
    ];
    let left = options.lookups ?? 3;
    for (const group of tries) {
      let found = false;
      for (const identity of group) {
        if (left <= 0 || looked.some((l) => l.identity === identity)) continue;
        left -= 1;
        const learned = await options.lookup(identity, message).catch(() => false);
        looked.push({ identity, learned });
        found ||= learned;
      }
      if (!found) continue;
      senses = new Map();
      ({ best, asTyped } = await choose());
      if (best || left <= 0) break;
    }
  }
  if (!best) return { looked };
  if (process.env.NAPKIN_FRAMES_DEBUG) console.error("best", best.score, format(best.reading.display));
  const result = await best.reading.run();
  if (result === undefined) return { looked };
  best.reading.learn?.();
  return { framed: { display: best.reading.display, result, text: best.text, edits: best.row.edits, chosen: best.reading.chosen }, looked };
}
