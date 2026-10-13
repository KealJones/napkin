/**
 * How a word feels: its valence, from the VADER lexicon (Hutto and Gilbert, 2014; MIT, read
 * from the vader-sentiment package, Apache-2.0), learned on the word the first time a message
 * says it and kept as `Valence(n)`, from -4 (worst) to 4 (best). ":(" is -1.9, "broken" -2.1,
 * "great" 3.1.
 *
 * Only what a word is worth is taken. How a message feels is worked out from its words by the
 * graph (`Feeling`, packs/follows.ncon), which reads these facts like any other, so a valence
 * the user corrects is the one used.
 */
import { moduleFile, read } from "#platform";
import { call, isCall } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { words } from "../runtime/host.js";

let lexicon: Map<string, number> | undefined;

function vader(): Map<string, number> {
  if (lexicon) return lexicon;
  lexicon = new Map();
  for (const line of (read(moduleFile("vader-sentiment/vader_lexicon.txt")) ?? "").split("\n")) {
    const [word, mean] = line.split("\t");
    const n = Number(mean);
    if (word && Number.isFinite(n)) lexicon.set(word.toLowerCase(), n);
  }
  return lexicon;
}

/**
 * The identity a word's valence is kept on: the written word (`Word_died`), apart from the
 * Concept the word may name, so a feeling is not taken for a fact about the thing. "died" and
 * "die" are their own. A letter that is not a-z is written by its code (":(" is `Word_x3ax28`).
 */
export const feelingName = (word: string): string =>
  "Word_" + [...word.toLowerCase()].map((ch) => (/[a-z]/.test(ch) ? ch : "x" + ch.codePointAt(0)!.toString(16))).join("");

/** Whether the graph already holds how this word feels. */
const held = (store: ConceptStore, id: string): boolean => store.asSubject(id).some((t) => t.predicate === "Valence");

/** The words of a message that feel some way, learned onto the graph if they were not yet. How many were new. */
export function learnFeelings(store: ConceptStore, message: string, cause?: number): number {
  const lex = vader();
  let stamp: number | undefined;
  let added = 0;
  for (const w of words(message)) {
    for (const form of new Set([w.text, w.typed].filter(Boolean).map((x) => x.toLowerCase()))) {
      const v = lex.get(form);
      if (v === undefined) continue;
      const id = feelingName(form);
      if (held(store, id)) continue;
      stamp ??= store.addRelation(
        "Vader",
        call("Imported", [{ name: "version", value: "1.1.3" }, { name: "license", value: "MIT" }]),
        undefined,
        cause,
      ).seq;
      store.addRelation(id, call("Valence", [{ value: v }]), undefined, stamp);
      added += 1;
    }
  }
  return added;
}

/** The valence the graph holds of a word, if any. */
export function valenceOf(store: ConceptStore, word: string): number | undefined {
  for (const t of store.asSubject(feelingName(word))) {
    if (t.predicate !== "Valence" || !isCall(t.expr)) continue;
    const v = t.expr.args[0]?.value;
    if (typeof v === "number") return v;
  }
  return undefined;
}
