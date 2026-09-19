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
import { reachesBehaviour } from "../runtime/select.js";
import { collectGaps, type Gap } from "../runtime/turn.js";
import { evidenceText, research } from "../research/sources.js";
import { Relations } from "../store/relations.js";
import { forwardSynonym } from "../seed/seed.js";
import { teach } from "./teacher.js";

export interface LearnStep {
  readonly identity: string;
  readonly how: "graph" | "research" | "teacher" | "unresolved";
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
  // Inheritance counts as connected: a Concept reaching behaviour through IsA needs
  // nothing, and attaching a SynonymOf to it would be noise.
  if (reachesBehaviour(runtime.store, identity)) return undefined;
  // Equivalence only. Following an IsA edge upward would give a category its children's
  // behaviour, which is meaningless — inheritance already runs the other way.
  const cluster = new Relations(runtime.store).cluster(identity, 24, true);
  const realizable = cluster.find((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
  if (!realizable) return undefined;
  runtime.store.addRelation(identity, c("SynonymOf", c(realizable.identity)));
  // Adding the relation is not enough: behaviour is what was missing, so derive the
  // forwarding realization the relation implies.
  forwardSynonym(runtime.store, identity, realizable.identity);
  return `forwards to ${realizable.identity}, derived from the synonym relation`;
}

/** Known, but reaching nothing realizable: an orphan, which attaching can fix. */
function isOrphan(runtime: Runtime, identity: string): boolean {
  if (!runtime.store.has(identity)) return false;
  if (reachesBehaviour(runtime.store, identity)) return false;
  return new Relations(runtime.store)
    .cluster(identity, 24, true)
    .some((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
}

/** CamelCase identities read badly as search queries. */
export function readable(identity: string): string {
  return identity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

export async function learn(
  runtime: Runtime,
  message: string,
  expression: Expr,
  context: Expr,
  options: ModelOptions & { maxPasses?: number; teacher?: boolean; research?: boolean } = {},
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

      // Research before asking. The Teacher is a last resort, and grounding it in
      // source-attributed evidence is the difference between learning and inventing.
      let evidence = "";
      if (options.research !== false) {
        try {
          const findings = await research(readable(gap.identity));
          evidence = evidenceText(findings);
          if (evidence) {
            steps.push({
              identity: gap.identity,
              how: "research",
              detail: `${findings.length} findings from ${[...new Set(findings.map((f) => f.source))].join(" and ")}`,
            });
          }
        } catch {
          // Research is best-effort: an unreachable network must not stop learning.
        }
      }

      const taught = await teach(
        runtime.store,
        { identity: gap.identity, message, expression: format(expression), evidence },
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
