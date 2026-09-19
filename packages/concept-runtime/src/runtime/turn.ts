/**
 * One turn: a message becomes Concepts, the Concepts are realized, and whatever could not
 * be realized is collected as the work queue.
 *
 * Gaps are found by walking the realized result, not by reading a top-level wrapper
 * (concept-spec Part 8.2). A parallel list of gaps alongside the tree would be duplicate
 * state that can disagree with it.
 */
import { type Expr, format, isCall } from "../concept/expression.js";
import { hear, type EarsResult, type HearOptions } from "../ears/ears.js";
import { say } from "../ears/say.js";
import { learn, type LearnStep } from "../learn/learn.js";
import { resolveReferences } from "./references.js";
import { ConceptError } from "./errors.js";
import type { Runtime } from "./evaluator.js";

export interface Gap {
  /**
   * `unknown`   — the identity is not in the graph at all. This is the learning target.
   * `inert`     — the identity exists and simply has no applicable realization here.
   *               Normal and not a gap: markers, relations and pure data behave this way.
   * `reference` — an unresolved Ref, needing history rather than teaching.
   */
  readonly kind: "unknown" | "inert" | "reference";
  readonly identity: string;
  readonly expression: string;
}

export interface TurnResult {
  readonly heard: EarsResult;
  readonly parsed: string | undefined;
  /** References the parser marked, and what memory resolved them to. */
  readonly resolved: { reference: string; to: string }[];
  readonly result: Expr | undefined;
  readonly rendered: string;
  /** The result as a sentence. The graph decides the answer; this only says it. */
  readonly spoken: string;
  readonly gaps: Gap[];
  readonly ambiguities: string[];
  readonly learned: LearnStep[];
  readonly failed?: string;
}

/** Everything the graph could not realize, plus every unresolved reference. */
export function collectGaps(runtime: Runtime, result: Expr | undefined): Gap[] {
  const gaps = new Map<string, Gap>();

  for (const event of runtime.trace.residuals()) {
    // A residual is not automatically a gap. A Concept that exists and simply does not
    // realize here is behaving correctly — that is how markers, relations and pure data
    // work. Only an identity the graph has never heard of is something to learn.
    gaps.set(event.concept, {
      kind: runtime.store.has(event.concept) ? "inert" : "unknown",
      identity: event.concept,
      expression: format(event.input),
    });
  }
  const walk = (e: Expr): void => {
    if (!isCall(e)) return;
    if (e.head === "Ref") {
      gaps.set(`Ref:${format(e)}`, { kind: "reference", identity: "Ref", expression: format(e) });
    }
    for (const a of e.args) walk(a.value);
  };
  if (result) walk(result);
  return [...gaps.values()];
}

export interface TurnOptions extends HearOptions {
  /** Close gaps by learning before answering (concept-spec Part 12). */
  learn?: boolean;
  /** Render the result as a sentence. */
  speak?: boolean;
  maxPasses?: number;
  research?: boolean;
}

export async function turn(
  runtime: Runtime,
  message: string,
  context: Expr,
  options: TurnOptions = {},
): Promise<TurnResult> {
  runtime.reset();
  // Deixis reads ambient state: Self() needs to know which message it is inside.
  runtime.context.set("message", message);
  const heard = await hear(runtime.store, message, options);
  if (!heard.expression) {
    return {
      heard,
      parsed: undefined,
      resolved: [],
      result: undefined,
      rendered: "(nothing parsed)",
      spoken: "I could not read that as Concepts.",
      gaps: [],
      ambiguities: [],
      learned: [],
      failed: heard.problems.join("; "),
    };
  }

  // A Ref marks a reference the parser could not resolve. Resolving it is memory's job.
  const { expression: maybe, resolved } = resolveReferences(heard.expression, options.history ?? []);
  const expression = maybe ?? heard.expression;

  let result: Expr | undefined;
  let failed: string | undefined;
  let learned: LearnStep[] = [];

  if (options.learn) {
    const outcome = await learn(runtime, message, expression, context, options);
    result = outcome.result;
    learned = outcome.steps;
  } else {
    try {
      result = await runtime.evaluate(expression, context);
    } catch (caught) {
      failed = caught instanceof ConceptError ? format(caught.value) : String(caught);
    }
  }

  const rendered = result ? format(result) : (failed ?? "(no result)");
  const gaps = collectGaps(runtime, result);
  // Anything the graph has never heard of means the result is not an answer.
  const unrealized = gaps.filter((g) => g.kind === "unknown").map((g) => g.identity);
  const spoken =
    options.speak === false || !result
      ? rendered
      : await say(message, result, { ...options, unrealized });

  return {
    heard,
    parsed: format(expression),
    resolved,
    result,
    rendered,
    spoken,
    gaps,
    ambiguities: [...runtime.ambiguities],
    learned,
    failed,
  };
}
