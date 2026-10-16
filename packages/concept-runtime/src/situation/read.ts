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
import { lemma } from "../runtime/host.js";
import { filled, type Piece } from "../frame/compose.js";
import { frames, type Word } from "../frame/frames.js";
import { lexicon } from "./lexicon.js";
import type { Amount, Asked, Situation, Unit } from "./situation.js";

interface Sentence {
  readonly piece: Piece;
  readonly words: readonly Word[];
  readonly text: string;
}

/** Each sentence of a message, as the one reader fits its words together; nothing is run or kept. */
export async function readSentences(runtime: Runtime, message: string): Promise<Sentence[]> {
  const out: Sentence[] = [];
  for (const text of message.split(/(?<=[.!?])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean)) {
    let got: Sentence | undefined;
    await frames(runtime, text, [], { pieces: (piece, words) => (got ??= { piece, words, text }) }).catch(() => undefined);
    if (got) out.push(got);
  }
  return out;
}

const walk = (p: Piece): Piece[] => [p, ...p.fills.flatMap((f) => walk(f.piece))];

/** The situation the sentences tell and the question asks, or undefined when they do not tell one. */
export function situationFromSentences(store: ConceptStore, sentences: readonly Sentence[]): Situation | undefined {
  const lex = lexicon(store);
  const asking = sentences.findIndex((s) => walk(s.piece).some((p) => p.ask));
  if (asking < 0) return undefined;
  const base = (w: string) => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, "");
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
    const holderOf = (clause: Piece | undefined): string | undefined => {
      const who = clause ? [...filled(clause, "Doer"), ...filled(clause, "Subject")][0] : undefined;
      if (!who) return lastHolder;
      if (pointing(s, who)) return lastHolder;
      const owner = filled(who, "Whose")[0];
      return (owner ? owner.text : who.text).replace(/['’]s$/, "").toLowerCase();
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
      return undefined;
    };
    if (at === asking) {
      const ask = walk(s.piece).find((p) => p.ask)!;
      const counted = walk(s.piece).find((p) => p.role === "ReadThing" && filled(p, "Count").some((x) => x.ask));
      // Said in a unit ("in dollars"): a link that marks no rate, to a thing the graph says measures something.
      const inUnit = walk(s.piece).flatMap((p) => filled(p, "Where")).filter((l) => !lex.marks(l.text, "Each")).flatMap((l) => filled(l, "What")).find((x) => lex.measures(base(x.text)));
      const unitName = counted ? base(counted.text) : inUnit ? base(inUnit.text) : lastUnit;
      const clause = clauseOf(ask);
      const holder = holderOf(clause);
      // Asked per a span ("make every day"): a rate asked.
      const per = clause ? perOf(clause) : undefined;
      const all = s.words.map((w) => w.text);
      const unit: Record<string, number> = {};
      if (unitName) unit[unitName] = 1;
      if (per && per !== unitName) unit[per] = -1;
      asked = {
        unit: unit as Unit,
        left: all.some((w) => lex.marks(w, "Remaining")),
        total: all.some((w) => lex.marks(w, "Whole")),
        more: false,
        ...(holder ? { holder } : {}),
        said: s.text,
      };
      return;
    }
    for (const p of walk(s.piece)) {
      const count = p.role === "ReadThing" ? filled(p, "Count").find((x) => typeof x.value === "number") : undefined;
      const alone = p.role === "ReadThing" && typeof p.value === "number" && !walk(s.piece).some((q) => filled(q, "Count").includes(p)) ? p : undefined;
      const number = count ?? alone;
      if (!number || typeof number.value !== "number") continue;
      const clause = clauseOf(p);
      const holder = holderOf(clause);
      const doing = clause?.role === "ReadDoing" ? base(clause.text) : undefined;
      const money = new RegExp(`\\$\\s*${number.value}\\b`).test(s.text);
      const thing = count ? base(p.text) : money ? "dollar" : lastUnit;
      const per = perOf(p) ?? (clause ? perOf(clause) : undefined);
      const unit: Record<string, number> = {};
      if (thing) unit[thing] = 1;
      if (per && per !== thing) unit[per] = (unit[per] ?? 0) - 1;
      if (count) lastUnit = base(p.text);
      amounts.push({
        value: number.value,
        unit: unit as Unit,
        said: `${number.value}${thing ? ` ${thing}` : ""}${per ? ` per ${per}` : ""}`,
        sentence: at,
        sign: doing ? lex.effect(doing) : 0,
        ...(holder ? { holder } : {}),
        ...(doing ? { doing } : {}),
        near: walk(p).map((x) => base(x.text)),
      });
    }
    const named = holderOf(clauses[0]);
    if (named) lastHolder = named;
  });
  if (!asked || !amounts.length) return undefined;
  return { amounts, asked };
}
