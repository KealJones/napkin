/**
 * The Ears: a message becomes a Concept expression, by hearing it (Hear() in
 * packs/hearing.ncon): each word is its own Concept and the words find each other in the graph.
 * No model hears. Checks run on the result mechanically, so a reading that lost a question or
 * a clause says so.
 */
import { type Expr, c, call, format, heads, isCall, walk } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import type { ConceptStore } from "../store/store.js";
import { dropArticles, lift as liftLines, mendDates, mendNumbers, mendWords, stripFence, type Lifted } from "./lift.js";
import { correct, expandBare, useGraphNames } from "./parser/words.js";

/** The graph size the speller last took names from, so it refreshes only when the graph grows. */
let graphNamesAt = -1;

const INTERROGATIVES = new Set([
  "What", "Who", "When", "Where", "Why", "How", "HowMany", "WhichOf", "Whether",
]);

/**
 * A question is detectable from the surface, which is what makes check 1 checkable.
 *
 * The Ears marks mood, not use: "can you write me a function" is a question in form, so it
 * carries an interrogative, and reading it as a request belongs to the graph. The one
 * exclusion is an order that happens to start with an auxiliary, "do not delete that".
 */
export function looksLikeQuestion(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (/^(please\b|do not\b|don'?t\b)/.test(t)) return false;
  if (t.includes("?")) return true;
  return /^(what|who|when|where|why|how|which|whether|is|are|do|does|did|can|could|should|would|will)\b/.test(t);
}

export interface EarsResult {
  readonly message: string;
  readonly raw: string;
  readonly expression: Expr | undefined;
  readonly problems: string[];
  readonly rejected: Lifted["rejected"];
}

export function check(message: string, expression: Expr | undefined): string[] {
  const problems: string[] = [];
  if (!expression) {
    problems.push("nothing parsed");
    return problems;
  }
  if (looksLikeQuestion(message)) {
    // A yes/no question is marked by its mood, not by a question word (reading-spec.md).
    const present = [...heads(expression)].some((h) => INTERROGATIVES.has(h) || h === "Interrogative" || h === "Checking");
    if (!present) {
      problems.push(
        "the message asks a question but the parse contains no interrogative " +
          "(What, Who, When, Where, Why, How, HowMany, WhichOf, Whether)",
      );
    }
  }
  for (const node of walk(expression)) {
    if (isCall(node) && !/^[A-Z]/.test(node.head)) {
      problems.push(`${node.head} must start with a capital letter`);
    }
  }
  return problems;
}

export interface HearOptions {
  /**
   * Recent turns, so a back-reference can be marked rather than invented. `result` is the IR,
   * which resolution needs in order to point a Ref at a real value; `spoken` is what was said.
   */
  history?: readonly { message: string; result: string; spoken?: string }[];
}

/** Lift, then apply the repairs that need the message itself. */
export function read(raw: string, message: string): Lifted {
  const lifted = liftLines(stripFence(raw));
  return lifted.expression === undefined ? lifted : { ...lifted, expression: dropArticles(mendDates(mendWords(mendNumbers(lifted.expression, message), message)), message) };
}

/**
 * Quotes as a keyboard types them straight: a phone types "France’s" and “hi”, which are the
 * same words as "France's" and "hi". Code a message shows keeps what it was written with.
 */
export function straightQuotes(message: string): string {
  return message
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"')))
    .join("");
}

export async function hear(store: ConceptStore, message: string, _options: HearOptions = {}): Promise<EarsResult> {
  if (store.size() !== graphNamesAt) {
    useGraphNames(store.all().map((u) => u.identity));
    graphNamesAt = store.size();
  }
  // Spelling corrected ("waht" is what), for now: a correction should become a competing
  // reading, both looked up (design/prompt-hearing.md 10), and the Said keeps what was typed
  // either way.
  const spelled = correct(expandBare(straightQuotes(message))).text;
  const heard = await new Runtime(store).evaluate(call("Hear", [{ value: spelled }, { value: "rules" }]), c("Execution"));
  const lines = isCall(heard) && heard.head === "Phrases" ? heard.args.filter((a) => a.name === undefined).map((a) => format(a.value)) : [];
  const raw = lines.join("\n");
  const lifted = lines.length ? read(raw, message) : { expression: undefined, clauses: 0, rejected: [] };
  return { message, raw, expression: lifted.expression, problems: check(message, lifted.expression), rejected: lifted.rejected };
}
