/**
 * The learning loop (concept-spec Part 12).
 *
 * Invent, realize, collect, try to learn unaided, ask the Teacher last, save, re-evaluate.
 *
 * The loop is bounded and every step is traced. A gap that cannot be closed stays a
 * residual, which is an honest outcome and better than a fabricated realization.
 */
import { type Expr, c, format, isCall, walk } from "../concept/expression.js";
import { facets } from "../runtime/context.js";
import { lineage, reachesBehaviour } from "../runtime/select.js";
import type { ModelOptions } from "../ears/ollama.js";
import { ConceptError } from "../runtime/errors.js";
import type { Runtime } from "../runtime/evaluator.js";

import { collectGaps, learnable, type Gap } from "../runtime/turn.js";
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
export function fromGraph(runtime: Runtime, identity: string): string | undefined {
  // Inheritance counts as connected: a Concept reaching behaviour through IsA needs
  // nothing, and attaching a SynonymOf to it would be noise.
  if (reachesBehaviour(runtime.store, identity)) return undefined;
  // Equivalence only. Following an IsA edge upward would give a category its children's
  // behaviour, which is meaningless — inheritance already runs the other way.
  const cluster = new Relations(runtime.store).cluster(identity, 24, true);
  const realizable = cluster.find((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
  if (!realizable) return undefined;
  // Adding the relation is not enough: behaviour is what was missing, so derive the
  // forwarding realization the relation implies -- but only if the target has behaviour
  // to lend. Forwarding to something that only forwards back is how Hi and Hello ended up
  // pointing at each other until the depth budget stopped them.
  if (!forwardSynonym(runtime.store, identity, realizable.identity)) return undefined;
  runtime.store.addRelation(identity, c("SynonymOf", c(realizable.identity)), undefined, runtime.trace.cause);
  return `forwards to ${realizable.identity}, derived from the synonym relation`;
}

/** What the graph holds for an identity, so progress can be measured rather than assumed. */
function size(runtime: Runtime, identity: string): { relations: number; realizations: number } {
  const unit = runtime.store.get(identity);
  return { relations: unit?.relations.length ?? 0, realizations: unit?.realizations.length ?? 0 };
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
  options: ModelOptions & {
    maxPasses?: number;
    teacher?: boolean;
    research?: boolean;
    /** Identities already asked about, shared across re-readings of one message. */
    asked?: Set<string>;
  } = {},
): Promise<LearnResult> {
  const maxPasses = options.maxPasses ?? 3;
  const steps: LearnStep[] = [];
  let result: Expr | undefined;
  let passes = 0;
  /**
   * Names a rejected realization said it needed first. A taught body may only compose
   * Concepts that already exist, so when one is refused for naming something unreal, that
   * name becomes the next thing to learn rather than a dead end.
   */
  const pending = new Set<string>();
  /**
   * Identities already put to the Teacher this turn. Without this the loop asked the same
   * question three times: a declaration that saved nothing still counted as progress, so
   * the pass repeated verbatim, research and all.
   */
  const attempted = options.asked ?? new Set<string>();

  for (let pass = 0; pass < maxPasses; pass += 1) {
    passes = pass + 1;
    runtime.reset();
    try {
      result = await runtime.evaluate(expression, context);
    } catch (caught) {
      result = caught instanceof ConceptError ? caught.value : undefined;
    }

    const all = collectGaps(runtime, result);
    for (const identity of pending) {
      if (!runtime.store.has(identity)) {
        all.push({ kind: "unknown", identity, expression: `${identity}()`, input: c(identity) });
      }
    }
    pending.clear();
    const gaps = learnable(runtime, all);
    if (!gaps.length) return { steps, result, passes, remaining: [] };

    let learnedSomething = false;
    for (const gap of gaps) {
      const viaGraph = fromGraph(runtime, gap.identity);
      if (viaGraph) {
        steps.push({ identity: gap.identity, how: "graph", detail: viaGraph });
        learnedSomething = true;
        continue;
      }
      // Teaching a Concept it already knows would pollute it; teaching a REALIZATION it
      // is missing is exactly the point, so only the former is refused.
      if (runtime.store.has(gap.identity) && gap.kind !== "inert") continue;
      if (options.teacher === false) continue;
      if (attempted.has(gap.identity)) continue;
      attempted.add(gap.identity);

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

      const unit = runtime.store.get(gap.identity);
      const behaviour = gap.kind === "inert" && unit !== undefined;
      /**
       * Teach the behaviour the CONTEXT needs, not a context-free one.
       *
       * Evaluating under `TypeScript()` and finding something unrealized means a TypeScript
       * rendering is missing — so that is what to ask for. Without this the loop taught an
       * ordinary realization while the question was how to write the thing in a language,
       * and studying `--as TypeScript` separately invented call shapes the Ears never
       * produces: it taught `Function($name, $parameters, $body)` while the parser writes
       * `Function(TypeScript(), Says("hello world"))`, and the pattern never matched.
       *
       * Driven from the real call, the shape is whatever the parser actually said.
       */
      const language = facets(context).find(
        (f) =>
          isCall(f) &&
          lineage(runtime.store, f.head).some((u) => u.identity === "TargetLanguage"),
      );
      const taught = await teach(
        runtime.store,
        {
          identity: gap.identity,
          message,
          expression: format(expression),
          evidence,
          ...(behaviour && language !== undefined && isCall(language)
            ? { inContext: format(language) }
            : {}),
          ...(behaviour
            ? {
                unrealizedCall: gap.expression,
                existing: unit.realizations
                  .map((r) => `  ${format(r.pattern)}${r.context ? ` in ${format(r.context)}` : ""}`)
                  .join("\n"),
              }
            : {}),
        },
        options,
      );
      if (!taught.declaration) {
        steps.push({ identity: gap.identity, how: "unresolved", detail: taught.problem ?? "no declaration" });
        continue;
      }
      const before = size(runtime, gap.identity);
      try {
        const saved = await runtime.evaluate(taught.declaration, c("Execution"));
        // A refused realization names what it needed; queue those for the next pass.
        for (const node of walk(saved)) {
          if (!isCall(node) || node.head !== "NeedsFirst") continue;
          for (const item of walk(node)) {
            if (isCall(item) && item.head !== "NeedsFirst" && item.head !== "List") {
              pending.add(item.head);
            }
          }
        }
        steps.push({
          identity: gap.identity,
          how: "teacher",
          detail: `${format(taught.declaration)} -> ${format(saved)}`,
        });
        // A declaration that changed nothing is not something learned. `Saved(Add(), 0)`
        // used to count, so the loop believed it had progressed and ran the same pass
        // again. Progress is measured against the graph, not against the reply.
        const after = size(runtime, gap.identity);
        if (after.relations > before.relations || after.realizations > before.realizations) {
          learnedSomething = true;
        }
      } catch (caught) {
        steps.push({
          identity: gap.identity,
          how: "unresolved",
          detail: caught instanceof ConceptError ? format(caught.value) : String(caught),
        });
      }
    }
    // Nothing new was learned and nothing is queued, so another pass repeats this one.
    if (!learnedSomething && pending.size === 0) break;
  }

  runtime.reset();
  try {
    result = await runtime.evaluate(expression, context);
  } catch (caught) {
    result = caught instanceof ConceptError ? caught.value : result;
  }
  return { steps, result, passes, remaining: collectGaps(runtime, result) };
}
