/**
 * A question asked of what it supposes ("if x is 3 what is x times 2"): where the supposing ends
 * and the asking begins, by what the graph says the words are (a word that Supposes, then a
 * QuestionWord). The turn tells the supposing, asks the question with it held, and takes back what
 * the supposing put in the graph once it is answered.
 */
import { c } from "../concept/expression.js";
import { nameOf } from "../ears/parser/names.js";
import type { ConceptStore } from "../store/store.js";
import { typesOf } from "../runtime/types.js";

export function supposing(store: ConceptStore, message: string): { supposed: string; asked: string } | undefined {
  const said = message.trim().split(/\s+/);
  const concept = (w: string) => nameOf(w.replace(/[^\p{L}]/gu, ""));
  const supposes = (w: string) => store.asSubject(concept(w)).some((t) => t.predicate === "Supposes");
  const asks = (w: string) => typesOf(store, c(concept(w))).includes("QuestionWord");
  const at = supposes(said[0] ?? "") ? said.findIndex((w, i) => i > 1 && asks(w)) : -1;
  if (at <= 1) return undefined;
  return { supposed: said.slice(1, at).join(" ").replace(/[,;]$/, ""), asked: said.slice(at).join(" ") };
}
