/**
 * A word problem read by the one reader: each sentence composed by its words' holes (frame/compose.ts),
 * the amounts taken from what the pieces say, then worked out by the solver (situation.ts `solve`).
 *
 * An amount is a number that counts a thing ("16 eggs": the eggs' count), or a number standing
 * alone where a thing goes ("she eats three": of the thing counted last). Who holds it is the one
 * its clause is said of (the doing's doer, what "is" is said of), "she" the one named last. What
 * the doing does to it is the graph's (`Adds`/`Removes`, the lexicon's effect). A rate is a count
 * said with a word that marks each one ("per day", "every morning": `Marks(Each())`, `CountsPer`).
 * What is asked is the question's amount: what it counts ("how many apples"), or what it is said
 * in ("how much in dollars"); asked of all ("in total") or of what is left by what the graph marks.
 */
import type { ConceptStore } from "../store/store.js";
import type { Runtime } from "../runtime/evaluator.js";
import { lemma, words as hostWords } from "../runtime/host.js";
import { filled, type Composed, type Piece } from "../frame/compose.js";
import { isCall } from "../concept/expression.js";
import { frames, type Word } from "../frame/frames.js";
import { lexicon } from "./lexicon.js";
import { conversionsFor, resolveRatios, withCapacity, type Amount, type Asked, type Situation, type Unit } from "./situation.js";

interface Sentence {
  readonly piece: Piece;
  readonly words: readonly Word[];
  readonly text: string;
  /** Every way its words were fitted together, best first, with the choices that made each (for learning the weights). */
  readonly ranked: readonly Composed[];
}

/** Each sentence of a message, as the one reader fits its words together; nothing is run or kept. */
export async function readSentences(runtime: Runtime, message: string): Promise<Sentence[]> {
  const out: Sentence[] = [];
  // Sentences, and the clauses a comma parts in one that asks ("If Martha has 68 apples, how many …").
  // A question after what it supposes ("If Martha has 68 apples, how many …"): the supposing apart
  // from the asking, at the comma before the chunk that asks; said first, it keeps its commas whole.
  const asks = (x: string) => hostWords(x).some((w) => w.tags.includes("QuestionWord"));
  const parts = message.split(/(?<=[.!?])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean).flatMap((x) => {
    if (!/\?$/.test(x)) return [x];
    const chunks = x.split(/,\s+/);
    const k = chunks.findIndex(asks);
    return k > 0 ? [chunks.slice(0, k).join(", "), chunks.slice(k).join(", ")] : [x];
  });
  const readOne = async (text: string): Promise<Sentence | undefined> => {
    let got: Sentence | undefined;
    await frames(runtime, text, [], { pieces: (piece, words, ranked) => (got ??= { piece, words, text, ranked }) }).catch(() => undefined);
    // Said joined to what came before ("and each jaguar eats …"): the clause it joins.
    const joined = got && got.piece.role === "ReadJoining" && got.piece.fills.length === 1 ? got.piece.fills[0]!.piece : undefined;
    return got && joined ? { ...got, piece: joined } : got;
  };
  // A clause said whole: something done, or said to be, of someone.
  const clause = (s: Sentence) => (s.piece.role === "ReadDoing" || s.piece.role === "ReadSame") && s.piece.fills.some((f) => f.hole === "Doer" || f.hole === "Subject");
  for (const text of parts) {
    // Clauses a comma parts ("each bird eats 12 beetles, each snake eats 3 birds"): each read alone,
    // when each is a clause of its own; otherwise the commas part a list, read whole.
    const chunks = text.split(/,\s+/);
    if (chunks.length > 1) {
      const read = await Promise.all(chunks.map(readOne));
      if (read.every((r) => r && clause(r))) {
        out.push(...(read as Sentence[]));
        continue;
      }
    }
    const got = await readOne(text);
    if (got) out.push(got);
  }
  return out;
}

const walk = (p: Piece): Piece[] => [p, ...p.fills.flatMap((f) => walk(f.piece))];

/** The situation the sentences tell and the question asks, or undefined when they do not tell one. */
export function situationFromSentences(store: ConceptStore, sentences: readonly Sentence[]): Situation | undefined {
  const lex = lexicon(store);
  // What is asked: the sentence that asks ("…?"), not one a question word only joins ("a wallet which costs $100").
  const asks = sentences.map((s) => walk(s.piece).some((p) => p.ask));
  const marked = sentences.map((s, i) => (asks[i] && /\?\s*$/.test(s.text) ? i : -1)).filter((i) => i >= 0);
  const asking = marked.length ? marked.at(-1)! : asks.lastIndexOf(true);
  if (asking < 0) return undefined;
  const base = (w: string) => {
    const lower = w.toLowerCase().replace(/[^\p{L}]/gu, "");
    return lex.synonym(lower) ?? (lemma(lower) || lower);
  };
  const pointing = (s: Sentence, p: Piece) => s.words[p.word]?.senses.some((x) => x.type === "pointer") ?? false;
  const amounts: Amount[] = [];
  let lastHolder: string | undefined;
  let lastUnit: string | undefined;
  let asked: Asked | undefined;
  sentences.forEach((s, at) => {
    // Who the clause is said of, and what is done in it.
    const clauses = walk(s.piece).filter((p) => p.role === "ReadDoing" || p.role === "ReadSame");
    // Who can hold: someone, as the tagger or the graph says (a name, a person), not a thing or a question.
    const tags = new Map(hostWords(s.text).map((w) => [w.text.toLowerCase().replace(/[^a-z'’]/g, ""), w.tags]));
    const someone = (p: Piece) => {
      const t = tags.get(p.text.toLowerCase().replace(/[^a-z'’]/g, "")) ?? [];
      return !p.ask && p.value === undefined && !t.includes("Pronoun") && (t.includes("Person") || t.includes("ProperNoun") || (t.includes("Possessive") && t.includes("Noun")) || store.asSubject(p.head).some((x) => x.predicate === "IsA" && x.object !== undefined && isCall(x.object) && (x.object as { head: string }).head === "Person"));
    };
    const holderOf = (clause: Piece | undefined): string | undefined => {
      const who = clause ? [...filled(clause, "Doer"), ...filled(clause, "Subject")][0] : undefined;
      if (!who) return lastHolder;
      if (pointing(s, who)) return lastHolder;
      const owner = filled(who, "Whose")[0];
      const named = owner ?? who;
      if (!someone(named)) return lastHolder;
      return named.text.replace(/['’]s$/, "").toLowerCase();
    };
    const clauseOf = (p: Piece): Piece | undefined => clauses.find((c) => walk(c).includes(p) && !walk(c).slice(1).some((x) => clauses.includes(x) && walk(x).includes(p))) ?? clauses[0];
    // A rate: a word marking each one said with it ("per day"), or one that counts per a span ("daily").
    const perOf = (p: Piece): string | undefined => {
      const links = filled(p, "Where");
      // A word marking each one, nearest the amount first; then a word that counts per a span.
      for (const l of [...links].sort((a, b) => Math.abs(a.word - p.word) - Math.abs(b.word - p.word))) {
        const what = filled(l, "What")[0];
        if (what && lex.marks(l.text, "Each")) return base(what.text);
      }
      for (const l of links) {
        const what = filled(l, "What")[0];
        if (what && lex.per(what.text.toLowerCase())) return lex.per(what.text.toLowerCase());
      }
      // Said after it, of one ("500 movies a day", "$5 a month"): so many for each one.
      const one = p.fills.find((f) => f.side === "after" && (f.hole === "Name" || f.hole === "Done") && filled(f.piece, "Determiner").some((x) => lex.marks(x.text, "Single") || lex.marks(x.text, "Each")));
      if (one) return base(one.piece.text);
      // A span each one of which it is done in ("eaten each day"): what is done, determined by a word marking each.
      const spans = filled(p, "Done").find((d) => d.value === undefined && !filled(d, "Count").length && filled(d, "Determiner").some((x) => lex.marks(x.text, "Each")));
      if (spans) return base(spans.text);
      return undefined;
    };
    // The one a clause is said of, determined by a word that marks each one ("each bird").
    const eachOf = (clause: Piece): string | undefined => {
      const who = [...filled(clause, "Doer"), ...filled(clause, "Subject")][0];
      return who && !pointing(s, who) && filled(who, "Determiner").some((d) => lex.marks(d.text, "Each")) ? base(who.text) : undefined;
    };
    if (at === asking) {
      const ask = walk(s.piece).find((p) => p.ask)!;
      const counted = walk(s.piece).find((p) => p.role === "ReadThing" && filled(p, "Count").some((x) => x.ask));
      // Said in a unit ("in dollars"): a link that marks no rate, to a thing the graph says measures something.
      const inUnit = walk(s.piece).flatMap((p) => filled(p, "Where")).filter((l) => !lex.marks(l.text, "Each")).flatMap((l) => filled(l, "What")).find((x) => lex.measures(base(x.text)));
      // "how much" asking nothing counted, where money was said: how much money.
      const moneySaid = amounts.some((a) => (a.unit["dollar"] ?? 0) > 0) || /\$\s*\d/.test(sentences.map((x) => x.text).join(" "));
      const unitName = counted ? (lex.marks(base(counted.text), "Money") ? "dollar" : base(counted.text)) : inUnit ? base(inUnit.text) : moneySaid && /much/i.test(ask.text) ? "dollar" : lastUnit;
      const clause = clauseOf(ask);
      const holder = holderOf(clause);
      // Asked per a span ("make every day"): a rate asked.
      // Asked per a span ("make every day", "are eaten each day"): of the clause, or of what it says is done.
      const per = clause ? perOf(clause) ?? filled(clause, "Said").filter((x) => x.role === "ReadDoing").map(perOf).find(Boolean) : undefined;
      const all = s.words.map((w) => w.text);
      const unit: Record<string, number> = {};
      if (unitName) unit[unitName] = 1;
      if (per && per !== unitName) unit[per] = -1;
      asked = {
        unit: unit as Unit,
        left: all.some((w) => lex.marks(w, "Remaining")),
        total: all.some((w) => lex.marks(w, "Whole")),
        more: false,
        // Asked of all of them together ("do Toulouse, Charleston, and Seattle have together"): no one holder.
        ...(holder && !all.some((w) => lex.marks(w, "Whole")) ? { holder } : {}),
        said: s.text,
      };
    }
    // Said as a share or a difference of someone else's ("half as many apples as Martha", "30 less
    // apples than Martha"): a word that multiplies (lex.times) or compares (lex.compares), and the one
    // it is of, the thing a link puts in that is no count and no unit.
    const ofWhom = (clause: Piece | undefined, unit: string | undefined): string | undefined => {
      if (!clause) return undefined;
      const linked = walk(clause).flatMap((x) => filled(x, "Where")).flatMap((l) => filled(l, "What"));
      const who = linked.find((x) => x.role === "ReadThing" && x.value === undefined && !filled(x, "Count").length && base(x.text) !== unit && !lex.measures(base(x.text)) && !lex.per(x.text.toLowerCase()));
      return who ? who.text.replace(/['’]s$/, "").toLowerCase() : undefined;
    };
    const ratios = new Set<Piece>();
    for (const times of walk(s.piece).filter((x) => lex.times(x.text) !== undefined && typeof x.value !== "number")) {
      const clause = clauseOf(times);
      if (!clause) continue;
      const unitPiece = walk(clause).find((x) => x.role === "ReadThing" && x !== times && x.value === undefined && lex.times(x.text) === undefined && filled(x, "Describer").length + filled(x, "Count").length > 0) ?? walk(clause).find((x) => x.role === "ReadThing" && x !== times && x.value === undefined && lex.times(x.text) === undefined && !filled(x, "Whose").length && filled(clause, "Doer")[0] !== x);
      const unitName = unitPiece ? base(unitPiece.text) : lastUnit;
      // "half that much": what was said just before. "half of the remaining pages": of what is left.
      // What it is of: the link said just after it ("of it", "of the remaining butter"), else its clause.
      const ofLink = walk(clause).find((x) => x.role === "ReadLink" && x.word === times.word + 1);
      const pointsAt = (i: number) => s.words[i]?.senses.some((x) => x.type === "pointer") ?? false;
      // "of it": the thing it points at, as said, not a share worked from it.
      const ofIt = !!ofLink && pointsAt(times.word + 2);
      const that = pointsAt(times.word + 1) || ofIt;
      const own = (p: Piece): Piece[] => [p, ...p.fills.filter((f) => f.hole !== "Also").flatMap((f) => own(f.piece))];
      const left = (ofLink ? own(ofLink) : walk(clause)).some((x) => x !== times && lex.marks(x.text, "Remaining"));
      const whom = that || left ? undefined : ofWhom(clause, unitName);
      // Of no one named ("sold half as many clips in May", "half of it"): of what was said just before.
      const before = !whom && !that && !left;
      if (before && !amounts.length) continue;
      ratios.add(times);
      const holder = holderOf(clause);
      amounts.push({ value: lex.times(times.text)!, unit: (unitName ? { [unitName]: 1 } : {}) as Unit, said: times.text, sentence: at, sign: lex.effect(base(clause.text)), ratio: true, of: left ? { last: true, left: true } : ofIt ? { last: true, thing: true } : that || before ? { last: true } : { holder: whom }, ...(holder ? { holder } : {}), doing: base(clause.text) });
    }
    for (const p of walk(s.piece)) {
      const count = p.role === "ReadThing" ? filled(p, "Count").find((x) => typeof x.value === "number") : undefined;
      const alone = p.role === "ReadThing" && typeof p.value === "number" && !walk(s.piece).some((q) => filled(q, "Count").includes(p)) ? p : undefined;
      const number = count ?? alone;
      if (!number || typeof number.value !== "number" || number.ask) continue;
      const clause = clauseOf(p);
      const holder = holderOf(clause);
      const doing = clause?.role === "ReadDoing" ? base(clause.text) : undefined;
      const money = new RegExp(`\\$\\s*${number.value}\\b`).test(s.text);
      // A count of times ("4 times as many", "3 times a week"): how often, or what multiplies, no thing of its own.
      const often = !!count && s.words[p.word]?.senses.some((x) => x.type === "op" && x.target === "Multiply");
      // Money said with what it is for each of ("$12 an hour", "$7 each"): dollars per that thing.
      const each = money && count && filled(p, "Determiner").some((d) => lex.marks(d.text, "Single") || lex.marks(d.text, "Each"));
      // A number said alone where something uncounted is done ("sold clips to 48 of her friends"): so many of it.
      const doneThing = alone && clause ? filled(clause, "Done").find((d) => d.role === "ReadThing" && d.value === undefined && !d.ask && !filled(d, "Count").length && !pointing(s, d)) : undefined;
      // Counted in a measure that names it ("an 8-ounce cup"): so much of the measure for each one.
      const measure = count ? filled(p, "Name").find((n) => n.word > number.word && lex.measures(base(n.text))) : undefined;
      const thing = often ? undefined : money ? "dollar" : measure ? base(measure.text) : count ? base(p.text) : doneThing ? base(doneThing.text) : lastUnit;
      const per = each || measure ? base(p.text) : perOf(p) ?? (clause ? perOf(clause) : undefined);
      const unit: Record<string, number> = {};
      if (thing) unit[thing] = 1;
      if (per && per !== thing) unit[per] = (unit[per] ?? 0) - 1;
      // Said of each one who does it ("each bird eats 12 beetles"): so many for each of them.
      const eachOne = clause ? eachOf(clause) : undefined;
      if (eachOne && eachOne !== thing && eachOne !== per) unit[eachOne] = (unit[eachOne] ?? 0) - 1;
      if (count && !often && !money) lastUnit = base(p.text);
      if (often && !perOf(p) && !(clause && perOf(clause))) {
        const unitPiece = clause ? walk(clause).find((x) => x.role === "ReadThing" && x !== p && x.value === undefined && filled(x, "Describer").length > 0) : undefined;
        const unitName = unitPiece ? base(unitPiece.text) : lastUnit;
        const whom = ofWhom(clause, unitName);
        if (whom) {
          const holder = holderOf(clause);
          amounts.push({ value: number.value, unit: (unitName ? { [unitName]: 1 } : {}) as Unit, said: `${number.value} times`, sentence: at, sign: 0, ratio: true, of: { holder: whom }, ...(holder ? { holder } : {}) });
          continue;
        }
      }
      // A share said in hundredths ("40% of the way", "25% as many"): a ratio of what it is said of.
      if (new RegExp(`\\b${number.value}\\s*(%|percent)`, "i").test(s.text)) {
        const whom = ofWhom(clause, lastUnit);
        const holder = holderOf(clause);
        amounts.push({ value: number.value / 100, unit: (lastUnit ? { [lastUnit]: 1 } : {}) as Unit, said: `${number.value}%`, sentence: at, sign: 0, ratio: true, of: whom ? { holder: whom } : { last: true }, ...(holder ? { holder } : {}) });
        continue;
      }
      // A difference said of someone else's ("30 less apples than Martha").
      const comparing = [...filled(p, "Name"), ...filled(p, "Describer"), ...(clause ? walk(clause) : [])].find((x) => x !== p && lex.compares(x.text) !== 0);
      const whom = comparing ? ofWhom(clause, thing) : undefined;
      amounts.push({
        ...(comparing && whom ? { ratio: true, of: { holder: whom, differs: lex.compares(comparing.text) } } : {}),
        value: number.value,
        unit: unit as Unit,
        said: `${number.value}${thing ? ` ${thing}` : ""}${per ? ` per ${per}` : ""}`,
        sentence: at,
        sign: doing ? lex.effect(doing) : 0,
        ...(holder ? { holder } : {}),
        ...(doing ? { doing } : {}),
        // Said as what can be had at most ("a budget of $200", "a limit of 5000 pounds"): a word marking it, just before.
        ...((clause ? walk(clause) : []).some((x) => x.word < number.word && x.word >= number.word - 3 && lex.marks(x.text, "Capacity")) ? { capacity: true } : {}),
        near: walk(p).map((x) => base(x.text)),
      });
    }
    const named = holderOf(clauses[0]);
    if (named) lastHolder = named;
  });
  if (!asked || !amounts.length) return undefined;
  const resolved = resolveRatios(withCapacity(amounts));
  return { amounts: [...resolved, ...conversionsFor(store, resolved, asked, asked.said)], asked };
}
