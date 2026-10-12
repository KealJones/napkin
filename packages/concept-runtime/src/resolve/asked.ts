/**
 * Which fact was asked for, chosen by every word of the question together.
 *
 * "What year was he born": the graph holds where he was born and when. "Born" alone fits both,
 * and taking the first that fits answered "Cincinnati". Each word asked constrains the answer,
 * and the fact that satisfies the most of them is the one meant:
 *
 *  - a word that names the relation, or that the relation is called ("born" is what Wikidata
 *    calls DateOfBirth and PlaceOfBirth; "directed" is of a piece with Director);
 *  - a word that names a part of the value ("year" of a Date), which then is the answer;
 *  - a word for the kind of thing the value is ("movies" of what is a Film);
 *  - what the question word asks for (Where asks a Place).
 *
 * A word left unused counts against a fact. A relation is read both ways: what Jaws holds of
 * Spielberg is also what Spielberg is asked for ("what did he direct"), found through the
 * store's object index, so no inverse is stored.
 *
 * Nothing here names a word or a relation: the same for chess, a jam website and a name.
 */
import { type Call, type Expr, c, call, isCall, walk } from "../concept/expression.js";
import { lemma } from "../runtime/host.js";
import { typesOf } from "../runtime/types.js";
import type { ConceptStore } from "../store/store.js";

/** Relations that say what a thing is, not a fact asked for by name. */
const STRUCTURAL = new Set(["IsA", "SubclassOf", "SynonymOf", "Named", "Called", "SameAs", "WrittenAs", "NotWrittenAs", "Said", "Asks"]);
const SCOPE = "ContextScope";

const wordsOf = (name: string): string[] => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Two words of a piece: the same, the same base form, or sharing their first five letters ("directed", "director"). */
const akin = (a: string, b: string): boolean => a === b || lemma(a) === lemma(b) || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
/** What a Concept is called besides its name: the heads of its Called(...) relations, as words. */
function called(store: ConceptStore, identity: string): string[] {
  const out: string[] = [];
  for (const r of store.get(identity)?.relations ?? []) {
    if (!isCall(r.claim) || r.claim.head !== "Called") continue;
    for (const part of walk(r.claim.args[0]?.value ?? null)) if (isCall(part)) out.push(...wordsOf(part.head));
  }
  return out;
}
/** Every word a thing of these kinds goes by: each kind's name, and what each is called. */
const kindWords = (store: ConceptStore, value: Expr): string[] => typesOf(store, value).flatMap((k) => [...wordsOf(k), ...called(store, k)]);

interface Found {
  readonly answer: Expr;
  readonly score: number;
  readonly relation: string;
}

export interface Asked {
  readonly answer: Expr;
  /** The relation the answer was read from, and the thing it was read on. */
  readonly relation: string;
  readonly of: string;
}

/**
 * The fact a question asks for, when one fits its words clearly better than any other.
 * `expression` is the question as read, names resolved.
 */
export function askGraph(store: ConceptStore, expression: Expr): Asked | undefined {
  let line = expression;
  let mood: string | undefined;
  while (isCall(line) && line.head === SCOPE && line.args.length === 2) {
    const facet = line.args[0].value;
    if (isCall(facet)) mood = facet.head;
    line = line.args[1].value;
  }
  if (mood !== "Interrogative" || !isCall(line)) return undefined;
  // A name said in two words is the one thing the graph names so: Spielberg(Steven()) is StevenSpielberg.
  const folded = new Set<string>();
  const heads = [...walk(line)].filter(isCall).flatMap((n) => {
    const first = n.args.length === 1 ? n.args[0].value : undefined;
    if (first !== undefined && isCall(first) && !first.args.length && store.has(first.head + n.head)) {
      folded.add(n.head).add(first.head);
      return [first.head + n.head];
    }
    return [n.head];
  }).filter((h) => !folded.has(h));
  // What the question word asks for (Who asks Someone), where it says.
  const asks = heads.flatMap((h) => (store.get(h)?.relations ?? []).flatMap((r) => (isCall(r.claim) && r.claim.head === "Asks" && isCall(r.claim.args[0]?.value) ? wordsOf((r.claim.args[0].value as Call).head) : [])));
  const facts = (id: string) => (store.get(id)?.relations ?? []).filter((r) => isCall(r.claim) && !STRUCTURAL.has(r.claim.head) && r.claim.args.length > 0);
  const things = [...new Set(heads)].filter((h) => facts(h).length > 0 || store.asObject(h).some((t) => !STRUCTURAL.has(t.predicate)));
  let best: (Found & { of: string }) | undefined;
  let second = -Infinity;
  for (const thing of things) {
    // The words asked: every word of the question but the thing itself, and words that only help say it.
    const asked = [...new Set(heads.filter((h) => h !== thing && !things.includes(h) && !["Helper", "Interrogative", "Determiner", "Preposition", "Pronoun"].some((k) => typesOf(store, c(h)).includes(k)) && h !== "Ref").flatMap(wordsOf))];
    if (!asked.length) continue;
    const weigh = (relation: string, value: Expr, kindOf: Expr): Found => {
      const names = [...wordsOf(relation), ...called(store, relation)];
      const kinds = kindWords(store, kindOf);
      let score = 0;
      let answer = value;
      for (const word of asked) {
        const part = isCall(value) ? value.args.find((a) => a.name !== undefined && akin(a.name, word)) : undefined;
        if (part) {
          score += 2;
          answer = part.value;
        } else if (names.some((n) => akin(n, word))) score += 2;
        else if (kinds.some((k) => akin(k, word))) score += 2;
        else score -= 1;
      }
      if (asks.some((a) => names.includes(a) || kinds.includes(a))) score += 1;
      return { answer, score, relation };
    };
    const found: Found[] = [];
    for (const r of facts(thing)) {
      const claim = r.claim as Call;
      found.push(weigh(claim.head, claim.args[0].value, claim.args[0].value));
    }
    // Read the other way: everything that holds this thing by one relation, together.
    const inverse = new Map<string, string[]>();
    for (const t of store.asObject(thing)) if (!STRUCTURAL.has(t.predicate)) inverse.set(t.predicate, [...(inverse.get(t.predicate) ?? []), t.subject]);
    for (const [relation, subjects] of inverse) {
      const each = subjects.map((s) => weigh(relation, c(s), c(s)));
      const top = Math.max(...each.map((f) => f.score));
      const kept = subjects.filter((_, i) => each[i].score === top);
      found.push({ relation, score: top, answer: kept.length === 1 ? c(kept[0]) : call("List", kept.map((s) => ({ value: c(s) }))) });
    }
    for (const f of found.sort((a, b) => b.score - a.score)) {
      if (!best || f.score > best.score) {
        second = best?.score ?? second;
        best = { ...f, of: thing };
      } else second = Math.max(second, f.score);
    }
  }
  // Clearly the one: it uses the words asked, and no other fact fits them as well.
  if (!best || best.score < 2 || best.score - second < 1) return undefined;
  return { answer: best.answer, relation: best.relation, of: best.of };
}
