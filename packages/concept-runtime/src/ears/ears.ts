/**
 * The Ears: a message becomes a Concept expression.
 *
 * Two checks run on the result, mechanically rather than hopefully. Both were measured:
 * together with the prompt rules they took validity from 67% to 100% and fidelity from
 * 65% to 86%.
 */
import { type Expr, heads, isCall, walk } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { lift, type Lifted } from "./lift.js";
import { generate, type ModelOptions } from "./ollama.js";
import { earsPrompt } from "./prompt.js";

const INTERROGATIVES = new Set([
  "What", "Who", "When", "Where", "Why", "How", "HowMany", "WhichOf", "Whether", "WhatIs",
]);

/** A question is detectable from the surface, which is what makes check 1 checkable. */
export function looksLikeQuestion(message: string): boolean {
  const t = message.trim().toLowerCase();
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
}

export function check(message: string, expression: Expr | undefined): string[] {
  const problems: string[] = [];
  if (!expression) {
    problems.push("nothing parsed");
    return problems;
  }
  if (looksLikeQuestion(message)) {
    const present = [...heads(expression)].some((h) => INTERROGATIVES.has(h));
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
  /** Recent turns, so a back-reference can be marked rather than invented. */
  history?: readonly { message: string; result: string }[];
  /** One corrective retry when a check fails. Off by default: it was measured as not
   *  worth it — coverage moved 86% to 90%, fidelity not at all, and under correction
   *  pressure the model began copying the prompt's own vocabulary literally. */
  retry?: boolean;
}

export async function hear(
  store: ConceptStore,
  message: string,
  options: HearOptions = {},
): Promise<EarsResult> {
  const system = earsPrompt(store, options.history ?? []);
  let raw = await generate(system, message, options);
  let lifted = lift(raw);
  let problems = check(message, lifted.expression);
  let attempts = 1;

  if (options.retry && (problems.length || lifted.rejected.length)) {
    const why = [...problems, ...lifted.rejected.map((r) => `${r.line}  <-- ${r.reason}`)].join("\n");
    raw = await generate(system, `${message}\n\nYour previous answer was rejected:\n${raw}\n\nProblems:\n${why}\n\nWrite it again, corrected.`, options);
    lifted = lift(raw);
    problems = check(message, lifted.expression);
    attempts = 2;
  }

  return { message, raw, expression: lifted.expression, problems, rejected: lifted.rejected, attempts };
}
