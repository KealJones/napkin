/**
 * The Ears: a message becomes a Concept expression.
 *
 * Two checks run on the result, mechanically rather than hopefully. Both were measured:
 * together with the prompt rules they took validity from 67% to 100% and fidelity from
 * 65% to 86%.
 */
import { type Expr, c, call, format, heads, isCall, walk } from "../concept/expression.js";
import { Runtime } from "../runtime/evaluator.js";
import type { ConceptStore } from "../store/store.js";
import { dropArticles, lift as liftLines, mendDates, mendNumbers, mendWords, stripFence, type Lifted } from "./lift.js";
import { frame } from "./mood.js";
import { parseRules } from "./parser/rules.js";
import { correct, expandBare, useGraphNames } from "./parser/words.js";
import { generate, type ModelOptions } from "./ollama.js";
import { earsPrompt } from "./prompt.js";

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
  readonly attempts: number;
  /** Which reader produced it: the grammar rules, or the model. */
  readonly backend?: "rules" | "model" | "prompt";
  /** When the rules were tried and gave up, why: the next rule to write. */
  readonly fallback?: string;
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

export interface HearOptions extends ModelOptions {
  /**
   * Replaces the built prompt entirely. For the Ears lab and the eval harness, which test a
   * prompt before it is written into `prompt.ts`; a turn never sets it.
   */
  system?: string;
  /**
   * Who reads the message. `model` (the default) is the LLM Ears. `rules` is the rule
   * parser alone (`parser/rules.ts`). `hybrid` tries the rules first and falls back to the
   * model, recording why, so every fallback names a rule not written yet.
   */
  backend?: "model" | "rules" | "hybrid" | "prompt";
  /**
   * Recent turns, so a back-reference can be marked rather than invented.
   *
   * `result` is the IR, which resolution needs in order to point a Ref at a real value.
   * `spoken` is what was actually said, which is what the parser is shown — handing it the
   * IR invited copying an earlier answer as the reading of a new message, and with no
   * vocabulary to anchor on it took the invitation.
   */
  history?: readonly { message: string; result: string; spoken?: string }[];
  /** One corrective retry when a CHECK fails. Off by default: it was measured as not
   *  worth it — coverage moved 86% to 90%, fidelity not at all, and under correction
   *  pressure the model began copying the prompt's own vocabulary literally.
   *
   *  A REJECTED LINE is different and always retries, flag or not. A failed check means
   *  the reading is poor; a rejected line means a clause of the message is GONE, and
   *  answering the surviving half silently is worse than any measured fidelity gain. */
  retry?: boolean;
  /**
   * Show the parser what the graph already contains.
   *
   * Off by default. The Ears' job is to render the idea the message carries, not to pick
   * from a menu: `ir-spec.md` Part 9 specifies the contract entirely in terms of form and
   * says nothing about a vocabulary, and Part 8.3 says the first parse of unfamiliar
   * vocabulary is necessarily the worst one, with the repair being to re-read the message
   * once the graph has grown. The list was a crib for a problem that has a proper answer
   * elsewhere, and the loop is now built.
   *
   * Measured on the same messages, one sample each: "owe a million dollars" came back as
   * `Negative(Million(Dollar()))` with the list and `Owe(Million(Dollars()))` without,
   * which is the failure exactly — a Concept it could see substituted for the idea the
   * message carried. Four of seven readings were identical either way, and one lost its
   * interrogative without the list, which `check` catches and retries.
   */
  vocabulary?: boolean;
}

/** Lift, then apply the repairs that need the message itself. */
export function read(raw: string, message: string, framed = false): Lifted {
  // A reader that already wrote each line's mood (the rules) skips the surface guess.
  const lifted = liftLines(framed ? stripFence(raw) : frame(stripFence(raw), message));
  return lifted.expression === undefined ? lifted : { ...lifted, expression: dropArticles(mendDates(mendWords(mendNumbers(lifted.expression, message), message)), message) };
}

export async function hear(
  store: ConceptStore,
  message: string,
  options: HearOptions = {},
): Promise<EarsResult> {
  let fallback: string | undefined;
  // The speller knows the graph's words, so a name it holds is not "corrected" away.
  if (options.backend === "rules" || options.backend === "hybrid" || options.backend === "prompt") {
    if (store.size() !== graphNamesAt) {
      useGraphNames(store.all().map((u) => u.identity));
      graphNamesAt = store.size();
    }
  }
  // Prompt hearing (design/prompt-hearing.md): the words find each other in the graph. Each
  // line it hears is read the way a rules reading is; nothing heard falls back to the rules.
  if (options.backend === "prompt") {
    // Spelling as the rules correct it ("waht" is what), for now: a correction should become a
    // competing reading, both looked up (design/prompt-hearing.md 10), and the Said keeps what
    // was typed either way.
    const spelled = correct(expandBare(message)).text;
    const heard = await new Runtime(store).evaluate(call("Hear", [{ value: spelled }, { value: "rules" }]), c("Execution"));
    const lines = isCall(heard) && heard.head === "Phrases" ? heard.args.map((a) => format(a.value)) : [];
    if (lines.length) {
      const raw = lines.join("\n");
      const lifted = read(raw, message, true);
      return { message, raw, expression: lifted.expression, problems: check(message, lifted.expression), rejected: lifted.rejected, attempts: 0, backend: "prompt" };
    }
  }
  if (options.backend === "rules" || options.backend === "hybrid" || options.backend === "prompt") {
    const ruled = parseRules(message);
    // In hybrid, a reading with words the rules could not read goes to the model instead.
    if (ruled.reading && !(options.backend === "hybrid" && ruled.unread)) {
      const raw = ruled.reading.lines.join("\n");
      const lifted = read(raw, message, true);
      const unread = (ruled.unread ?? []).map((w) => `rules could not read "${w}"`);
      return { message, raw, expression: lifted.expression, problems: [...unread, ...check(message, lifted.expression)], rejected: lifted.rejected, attempts: 0, backend: "rules" };
    }
    fallback = ruled.unread ? `could not read "${ruled.unread.join('", "')}"` : ruled.why ?? "no reading";
    if (options.backend === "rules" || options.backend === "prompt") {
      return { message, raw: "", expression: undefined, problems: [`rules: ${fallback}`], rejected: [], attempts: 0, backend: "rules", fallback };
    }
  }
  const system = options.system ?? earsPrompt(store, options.history ?? [], message, options.vocabulary === true);
  let raw = await generate(system, message, options);
  let lifted = read(raw, message);
  let problems = check(message, lifted.expression);
  let attempts = 1;

  // A dropped clause is lost content, so it always earns a second attempt.
  if (lifted.rejected.length || (options.retry && problems.length)) {
    const why = [...problems, ...lifted.rejected.map((r) => `${r.line}  <-- ${r.reason}`)].join("\n");
    const second = await generate(
      system,
      `${message}\n\nYour previous answer was rejected:\n${raw}\n\nProblems:\n${why}\n\nWrite it again, corrected.`,
      options,
    );
    const retried = read(second, message);
    const retriedProblems = check(message, retried.expression);
    attempts = 2;
    // Correction pressure can make it worse, so the second attempt has to earn its place.
    // Fewer lost clauses wins first, then fewer failed checks.
    const better =
      retried.rejected.length < lifted.rejected.length ||
      (retried.rejected.length === lifted.rejected.length && retriedProblems.length < problems.length);
    if (better) {
      raw = second;
      lifted = retried;
      problems = retriedProblems;
    }
  }

  return { message, raw, expression: lifted.expression, problems, rejected: lifted.rejected, attempts, backend: "model", ...(fallback ? { fallback } : {}) };
}
