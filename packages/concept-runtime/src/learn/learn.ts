/**
 * The learning loop (concept-spec Part 12).
 *
 * Invent, realize, collect, try to learn unaided, ask the Teacher last, save, re-evaluate.
 *
 * The loop is bounded and every step is traced. A gap that cannot be closed stays a
 * residual, which is an honest outcome and better than a fabricated realization.
 */
import { type Expr, c, format, isCall } from "../concept/expression.js";
import type { ModelOptions } from "../ears/ollama.js";
import { ConceptError } from "../runtime/errors.js";
import type { Runtime } from "../runtime/evaluator.js";
import { collectGaps, type Gap } from "../runtime/turn.js";
import { Relations } from "../store/relations.js";
import { teach } from "./teacher.js";

export interface LearnStep {
  readonly identity: string;
  readonly how: "graph" | "teacher" | "unresolved";
  readonly detail: string;
}

export interface LearnResult {
  readonly steps: LearnStep[];
  readonly result: Expr | undefined;
  readonly passes: number;
  readonly remaining: Gap[];
}

/**
 * Step 4: try the graph before the model.
 *
 * The real defect is disconnection, not absence (concept-spec Part 5.3). If a Concept sits
 * in a cluster that already contains something realizable, it needs attaching rather than
 * teaching, and attaching is free.
 */
function fromGraph(runtime: Runtime, identity: string): string | undefined {
  const unit = runtime.store.get(identity);
  if (unit && unit.realizations.length) return undefined; // already realizes; nothing to do
  const cluster = new Relations(runtime.store).cluster(identity);
  const realizable = cluster.find((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
  if (!realizable) return undefined;
  runtime.store.addRelation(identity, c("SynonymOf", c(realizable.identity)));
  return `attached to ${realizable.identity} via the existing cluster`;
}

/** Known, but reaching nothing realizable: an orphan, which attaching can fix. */
function isOrphan(runtime: Runtime, identity: string): boolean {
  const unit = runtime.store.get(identity);
  if (!unit || unit.realizations.length) return false;
  return new Relations(runtime.store)
    .cluster(identity)
    .some((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
}

export async function learn(
  runtime: Runtime,
  message: string,
  expression: Expr,
  context: Expr,
  options: ModelOptions & { maxPasses?: number; teacher?: boolean } = {},
): Promise<LearnResult> {
  const maxPasses = options.maxPasses ?? 2;
  const steps: LearnStep[] = [];
  let result: Expr | undefined;
  let passes = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    passes = pass + 1;
    runtime.reset();
    try {
      result = await runtime.evaluate(expression, context);
    } catch (caught) {
      result = caught instanceof ConceptError ? caught.value : undefined;
    }

    const all = collectGaps(runtime, result);
    // Teach what the graph has never heard of; attach what it knows but cannot reach.
    const gaps = all.filter((g) => g.kind === "unknown" || (g.kind === "inert" && isOrphan(runtime, g.identity)));
    if (!gaps.length) return { steps, result, passes, remaining: [] };

    let learnedSomething = false;
    for (const gap of gaps) {
      const viaGraph = fromGraph(runtime, gap.identity);
      if (viaGraph) {
        steps.push({ identity: gap.identity, how: "graph", detail: viaGraph });
        learnedSomething = true;
        continue;
      }
      // Never teach over something already known. Append-only means it would not be
      // destructive, but it would still pollute a Concept that was already right.
      if (runtime.store.has(gap.identity)) continue;
      if (options.teacher === false) continue;

      const taught = await teach(
        runtime.store,
        { identity: gap.identity, message, expression: format(expression) },
        options,
      );
      if (!taught.declaration) {
        steps.push({ identity: gap.identity, how: "unresolved", detail: taught.problem ?? "no declaration" });
        continue;
      }
      try {
        const saved = await runtime.evaluate(taught.declaration, c("Execution"));
        steps.push({
          identity: gap.identity,
          how: "teacher",
          detail: `${format(taught.declaration)} -> ${format(saved)}`,
        });
        learnedSomething = true;
      } catch (caught) {
        steps.push({
          identity: gap.identity,
          how: "unresolved",
          detail: caught instanceof ConceptError ? format(caught.value) : String(caught),
        });
      }
    }
    // Nothing new was learned, so another pass would produce the same residuals.
    if (!learnedSomething) break;
  }

  runtime.reset();
  try {
    result = await runtime.evaluate(expression, context);
  } catch (caught) {
    result = caught instanceof ConceptError ? caught.value : result;
  }
  return { steps, result, passes, remaining: collectGaps(runtime, result) };
}
