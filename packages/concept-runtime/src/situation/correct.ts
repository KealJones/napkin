/**
 * Told the answer to a situation Napkin worked out ("no, it's 15"), it learns from it as from a
 * worked example: the reading that comes to what was told is found among its own and said; the
 * weights move toward what that reading agreed with (kept as Situations Weighs(...)); and each word
 * beside the amounts is tried each way, a way that alone makes the told answer come out kept as
 * evidence on the word (`Told(Removes())`), the meaning itself once two tellings agree and none
 * says otherwise. Nothing is decided from one telling but the weights.
 */
import { c, call, format, isCall, type Call, type Expr } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words as hostWords } from "../runtime/host.js";
import type { ConceptStore } from "../store/store.js";
import { candidates, type Relation } from "./learnwords.js";
import { lexicon } from "./lexicon.js";
import { readings, sayAmount, situationOf, weightsOf, type Reading } from "./situation.js";
import { keepWeights } from "./weights.js";

export interface Correction {
  /** What Napkin had said. */
  readonly was?: number;
  /** The reading that comes to what was told, when one does. */
  readonly reading?: Reading;
  /** Meanings now known from tellings. */
  readonly learned: readonly { word: string; claim: Call }[];
  /** Words the telling counts as evidence for, not yet decided. */
  readonly noted: readonly { word: string; claim: Call }[];
}

/** The claim a way of acting is, in the graph's terms. */
const claimOf = (predicate: Relation, way: "Up" | "Down"): Call =>
  predicate === "Effect" ? c(way === "Down" ? "Removes" : "Adds") : predicate === "EffectOnMoney" ? call(way === "Down" ? "Removes" : "Adds", [{ value: c("Money") }]) : call(predicate, [{ value: c(way) }]);
const opposite = (claim: Call): string =>
  claim.head === "Removes" || claim.head === "Adds" ? format(call(claim.head === "Removes" ? "Adds" : "Removes", claim.args)) : format(call(claim.head, [{ value: c(format(claim.args[0]!.value as Expr) === "Up()" ? "Down" : "Up") }]));

export function correct(store: ConceptStore, message: string, told: number, cause?: number, rate = 0.25): Correction {
  const s = situationOf(store, message);
  const r = s && s.amounts.length <= 8 ? readings(s.amounts, s.asked) : undefined;
  const was = r?.best?.value;
  const right = (x: Reading) => Math.abs(x.value - told) < 1e-6;
  const reading = r?.ranked.find(right);
  // The words: each beside the amounts tried each way; a way that alone brings the told answer out.
  const lex = lexicon(store);
  const noted: { word: string; claim: Call }[] = [];
  const learned: { word: string; claim: Call }[] = [];
  if (was === undefined || Math.abs(was - told) > 1e-6) {
    // The words of what was told, not of the question: "how many does she have" asks, it does not act.
    const statements = message.split(/(?<=[.!?])\s+/).filter((x) => !/\?\s*$/.test(x)).join(" ");
    // Which words, tried alone, bring the told answer out, and how.
    const explains: { word: string; predicate: Relation; way: "Up" | "Down" }[] = [];
    for (const cand of candidates(statements || message)) {
      const works = (["Up", "Down"] as const).filter((way) => {
        lex.unsuppose();
        lex.suppose(cand.word, cand.predicate, way);
        const again = situationOf(store, message);
        const got = again && again.amounts.length <= 8 ? readings(again.amounts, again.asked)?.best?.value : undefined;
        return got !== undefined && Math.abs(got - told) < 1e-6;
      });
      lex.unsuppose();
      if (works.length === 1) explains.push({ ...cand, way: works[0]! });
    }
    // What is least known is what a surprise is put down to first: a word new to the graph before
    // one it knows much of ("zorped" before "has").
    // (What the tellings themselves say of a word is not knowing it.)
    const known = (w: string) => (store.get(nameOf(w))?.relations.filter((r) => !isCall(r.claim) || r.claim.head !== "Told").length ?? 0) + (store.get(nameOf(w))?.realizations.length ?? 0);
    const least = Math.min(...explains.map((e) => known(e.word)));
    for (const e of explains.filter((x) => known(x.word) === least)) {
      const claim = claimOf(e.predicate, e.way);
      const id = nameOf(e.word);
      store.addRelation(id, call("Told", [{ value: claim }]), undefined, cause);
      noted.push({ word: e.word, claim });
      // Each telling is a stamp on the Told relation: the same telling again is one more.
      const times = (what: string) => (store.get(id)?.relations ?? []).filter((r) => isCall(r.claim) && r.claim.head === "Told" && format(r.claim.args[0]!.value as Expr) === what).reduce((n, r) => n + (r.stamps?.length ?? 1), 0);
      // Decided when tellings agree: two for it, none for the other way.
      if (times(format(claim)) >= 2 && !times(opposite(claim)) && !store.asSubject(id).some((t) => format(t.expr) === format(claim))) {
        store.addRelation(id, claim, undefined, cause);
        learned.push({ word: e.word, claim });
      }
    }
  }
  // Only when no word's meaning explains the telling: a telling a word explains says what the word
  // means, not how to weigh every situation.
  const top = r?.ranked[0];
  if (!noted.length && reading && top && !right(top)) {
    const w = weightsOf(store);
    for (const k of new Set([...Object.keys(reading.features), ...Object.keys(top.features)])) w[k] = Math.round(((w[k] ?? 0) + rate * ((reading.features[k] ?? 0) - (top.features[k] ?? 0))) * 1000) / 1000;
    keepWeights(store, w, cause);
  }
  return { ...(was !== undefined ? { was } : {}), ...(reading ? { reading } : {}), learned, noted };
}

/** The correction as a Concept to say: Corrected(told, was, steps=List(...), learned=List(...)). */
/**
 * The answer told to a situation just worked out, or undefined when the message is not one: a short
 * reply after a worked answer with one amount and no thing of its own ("15", "no, it's 15 marbles";
 * "I have 2 kids" brings kids, so it is something new said).
 */
export function tellingOf(message: string, before: string): number | undefined {
  if (!before.startsWith("Worked(")) return undefined;
  const amounts = message.replace(/,(\d{3})/g, "$1").match(/-?\$?\d*\.?\d+/g) ?? [];
  if (amounts.length !== 1 || message.trim().split(/\s+/).length > 8) return undefined;
  const answered = /answer="[\d.,-]+ ([^"]*)"/.exec(before)?.[1]?.toLowerCase() ?? "";
  const own = hostWords(message).filter((w) => w.tags.includes("Noun") && !w.tags.includes("Pronoun") && !w.tags.includes("Value") && !answered.includes(lemma(w.text.toLowerCase())) && !answered.includes(w.text.toLowerCase()));
  return own.length ? undefined : Number(amounts[0]!.replace("$", ""));
}

export function corrected(x: Correction, told: number, unitSaid: (n: number) => string): Expr {
  return call("Corrected", [
    { name: "told", value: unitSaid(told) },
    ...(x.was !== undefined ? [{ name: "was", value: unitSaid(x.was) }] : []),
    { name: "found", value: !!x.reading },
    { name: "steps", value: call("List", (x.reading?.steps ?? []).map((st) => ({ value: st }))) },
    { name: "weighed", value: !x.noted.length && !!x.reading },
    { name: "noted", value: call("List", x.noted.map((n) => ({ value: n.word }))) },
    { name: "learned", value: call("List", x.learned.map((l) => ({ value: `"${l.word}" ${l.claim.head === "Removes" ? "takes away" : l.claim.head === "Adds" ? "adds" : l.claim.head === "Compares" ? (format(l.claim.args[0]!.value as Expr) === "Up()" ? "means more" : "means less") : "changes it " + (format(l.claim.args[0]!.value as Expr) === "Up()" ? "up" : "down")}${l.claim.args.length && l.claim.head !== "Compares" && l.claim.head !== "Changes" ? " money" : ""}` }))) },
  ]);
}

export { sayAmount };
