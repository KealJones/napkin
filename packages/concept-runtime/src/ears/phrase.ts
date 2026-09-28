/**
 * How the graph's multi-word names are said, found by hearing them: "work in progress" is heard
 * as Work(In(Progress())), so WorkInProgress folds that phrase (seed.ts, deriveFolds), and a
 * heard phrase can be said back as its words to be looked up whole (learn.ts).
 *
 * Hearing is a Concept run by the evaluator, so it is asynchronous: what a phrase is heard as is
 * kept here once heard, and folds are derived from what has been heard so far.
 */
import { type Expr, c, call, format, isCall } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import type { ConceptStore } from "../store/store.js";

/** Each phrase as heard, as one thing, or null when its words do not hear as one. */
export const heardPhrases = new Map<string, Expr | null>();

const words = (identity: string): string => identity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** A phrase heard as one thing: its one line, without the mood it was said in. */
export async function hearPhrase(store: ConceptStore, text: string): Promise<Expr | undefined> {
  if (heardPhrases.has(text)) return heardPhrases.get(text) ?? undefined;
  let heard: Expr;
  try {
    heard = await new Runtime(store).evaluate(call("Hear", [{ value: text }, { value: "rules" }]), c("Execution"));
  } catch {
    // Words hearing cannot take are not a phrase anything folds.
    heardPhrases.set(text, null);
    return undefined;
  }
  const lines = isCall(heard) && heard.head === "Phrases" ? heard.args.filter((a) => a.name === undefined).map((a) => a.value) : [];
  let one: Expr | undefined = lines.length === 1 ? lines[0] : undefined;
  if (one !== undefined && isCall(one) && (one.head === "Mood" || one.head === "ContextScope") && one.args.length === 2) one = one.args[1].value;
  const thing = one !== undefined && isCall(one) ? one : undefined;
  heardPhrases.set(text, thing ?? null);
  return thing;
}

/** Multi-word names, words only: a minted individual (Greg_1) or an acronym is not a phrase. */
export const multiWord = (identity: string): boolean => /^(?:[A-Z][a-z]+){2,}$/.test(identity);

/**
 * Hear the graph's multi-word names not heard yet, and fold them. Given a message, only the
 * names whose every word it says: a fold matters only where its phrase is said.
 */
export async function foldPhrases(store: ConceptStore, message?: string): Promise<number> {
  const said = message === undefined ? undefined : new Set(message.toLowerCase().match(/[a-z]+/g) ?? []);
  const { deriveFolds } = await import("../seed/seed.js");
  let heard = 0;
  // A name whose words were heard already (to say a phrase, say) but that has no fold yet, a
  // Concept just learned, needs one derived all the same.
  const folded = new Set(
    (store.get("Concept")?.realizations ?? []).flatMap((r) => r.properties.filter((p) => isCall(p) && p.head === "Fold").map((p) => (isCall(p) && isCall(p.args[0]?.value) ? p.args[0].value.head : ""))),
  );
  let unfolded = false;
  for (const unit of store.all()) {
    if (!multiWord(unit.identity)) continue;
    const text = words(unit.identity);
    if (said && !text.split(" ").every((w) => said.has(w))) continue;
    if (heardPhrases.has(text)) {
      if (heardPhrases.get(text) && !folded.has(unit.identity)) unfolded = true;
      continue;
    }
    await hearPhrase(store, text);
    heard += 1;
  }
  return heard || unfolded ? deriveFolds(store) : 0;
}

/**
 * The words a heard thing was said in: Cream(Ice()) is "ice cream", Work(In(Progress())) is
 * "work in progress". Undefined unless hearing the words gives the same thing back, so a phrase
 * is never guessed.
 */
export async function sayPhrase(store: ConceptStore, e: Expr): Promise<string | undefined> {
  // Every way the words could have been said; hearing decides which one it was.
  const ways = (x: Expr): string[][] => {
    if (!isCall(x) || x.args.some((a) => a.name !== undefined)) return [];
    const said = words(x.head);
    if (!x.args.length) return [[said]];
    const out: string[][] = [];
    // Describers first, then the thing: "ice cream".
    if (x.args.every((a) => isCall(a.value) && !a.value.args.length)) out.push([...x.args.flatMap((a) => ways(a.value)[0] ?? []), said]);
    // A thing and what follows it: "work in progress".
    if (x.args.length === 1) for (const after of ways(x.args[0].value)) out.push([said, ...after]);
    return out;
  };
  for (const w of ways(e)) {
    const text = w.join(" ");
    if (!text.includes(" ")) continue;
    const back = await hearPhrase(store, text);
    if (back !== undefined && format(back) === format(e)) return text;
  }
  return undefined;
}
