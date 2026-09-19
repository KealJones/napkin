/**
 * Study: learning driven by topics rather than by gaps.
 *
 * The learning loop answers a question and teaches whatever that question happened to
 * need. That makes the graph's growth a side effect of what someone thought to ask, which
 * is a poor way to acquire a domain — asked to weigh a million dollars, the graph had
 * learned `Dollar` in the same turn it was asked to value it
 * (`design/judgment-research.md` Part 9.5).
 *
 * Study inverts the driver. Give it topics; it researches and teaches each one, then
 * follows what the teaching revealed. Teaching `Money` yields `IsA(MediumOfExchange())`,
 * and `MediumOfExchange` is then a Concept the graph names but does not know — a frontier
 * to expand rather than a loose end. The same crawl picks up `NeedsFirst` refusals, so a
 * body that could not be saved for want of a Concept schedules that Concept instead.
 *
 * Everything it can reach is bounded: a budget of Concepts and a depth from the seeds.
 * Unbounded, a relation crawl reaches the whole of Wikidata.
 */
import { type Expr, isCall, walk } from "../concept/expression.js";
import type { ModelOptions } from "../ears/ollama.js";
import { ConceptError } from "../runtime/errors.js";
import type { Runtime } from "../runtime/evaluator.js";
import { c, format } from "../concept/expression.js";
import { evidenceText, research } from "../research/sources.js";
import { readable } from "./learn.js";
import { teach } from "./teacher.js";

/** Structural identities and containers. Teaching these would be teaching the harness. */
const STRUCTURAL = new Set([
  "Concept", "Realization", "Code", "Context", "Suppresses", "IsA", "List", "Rest",
  "Saved", "Rejected", "NeedsFirst", "SelfReferential", "NotComposed", "Incomplete",
  "True", "False", "Number", "String", "Boolean",
  // How a relation is said, not what it names. These leak in when a Teacher nests one.
  "InverseOf", "SynonymOf", "Symmetric", "Transitive", "Asymmetric", "Functional",
  "Irreflexive", "Disjoint", "Describes", "Relations",
]);

/** `medium of exchange` is a topic; `MediumOfExchange` is an identity. */
export function identityFor(topic: string): string {
  const cleaned = topic.trim().replace(/[^A-Za-z0-9 _-]/g, " ");
  if (/^[A-Z][A-Za-z0-9]*$/.test(cleaned)) return cleaned;
  return cleaned
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * What a unit names but does not explain. Relation OBJECTS, not predicates: `IsA(Money())`
 * contributes `Money`, and `Symmetric()` contributes nothing because it has no object.
 */
export function frontierFrom(relations: readonly Expr[]): string[] {
  const out = new Set<string>();
  for (const relation of relations) {
    if (!isCall(relation)) continue;
    for (const argument of relation.args) {
      for (const node of walk(argument.value)) {
        if (isCall(node) && !STRUCTURAL.has(node.head)) out.add(node.head);
      }
    }
  }
  return [...out];
}

export interface StudyStep {
  readonly identity: string;
  readonly depth: number;
  /**
   * `taught`    — the Teacher produced a declaration and the graph changed;
   * `known`     — already understood, so it was harvested rather than taught;
   * `refused`   — a declaration came back and saved nothing;
   * `failed`    — no usable declaration.
   */
  readonly how: "taught" | "known" | "refused" | "failed";
  readonly detail: string;
  /** Concepts this step put on the frontier. */
  readonly discovered: readonly string[];
}

export interface StudyResult {
  readonly steps: StudyStep[];
  readonly taught: number;
  readonly visited: number;
  /** Reached the budget with these still queued. */
  readonly remaining: string[];
}

export interface StudyOptions extends ModelOptions {
  /** Concepts actually taught before stopping. Default 25. */
  maxConcepts?: number;
  /** How far from a seed topic the crawl may wander. Default 2. */
  maxDepth?: number;
  /** Ground the Teacher in sources. On by default; off makes it recall-only. */
  research?: boolean;
  /** Off means crawl what is already known without asking the Teacher anything. */
  teacher?: boolean;
  /** Called after each step, so a long run is watchable. */
  onStep?: (step: StudyStep) => void;
  /** Called after each Concept taught, so a long run survives being killed. */
  onProgress?: () => void;
}

/** A Concept the graph holds and can say something about. */
function understood(runtime: Runtime, identity: string): boolean {
  const unit = runtime.store.get(identity);
  if (!unit) return false;
  return unit.relations.length > 0 || unit.realizations.length > 0;
}

export async function study(
  runtime: Runtime,
  topics: readonly string[],
  options: StudyOptions = {},
): Promise<StudyResult> {
  const maxConcepts = options.maxConcepts ?? 25;
  const maxDepth = options.maxDepth ?? 2;

  const steps: StudyStep[] = [];
  const seen = new Set<string>();
  const queue: { identity: string; depth: number }[] = topics
    .map((t) => ({ identity: identityFor(t), depth: 0 }))
    .filter((t) => t.identity.length > 0);

  let taught = 0;
  let visited = 0;

  const record = (step: StudyStep): void => {
    steps.push(step);
    options.onStep?.(step);
  };

  while (queue.length && taught < maxConcepts) {
    const { identity, depth } = queue.shift()!;
    if (seen.has(identity) || STRUCTURAL.has(identity)) continue;
    seen.add(identity);
    visited += 1;

    const push = (names: readonly string[], at: number): string[] => {
      const added = names.filter((n) => !seen.has(n) && !STRUCTURAL.has(n));
      if (at <= maxDepth) for (const n of added) queue.push({ identity: n, depth: at });
      return added;
    };

    // Already understood: nothing to teach, but what it names is still worth following.
    if (understood(runtime, identity)) {
      const discovered = push(frontierFrom(runtime.store.get(identity)!.relations), depth + 1);
      record({ identity, depth, how: "known", detail: "already understood", discovered });
      continue;
    }

    if (options.teacher === false) {
      record({ identity, depth, how: "failed", detail: "no Teacher", discovered: [] });
      continue;
    }

    let evidence = "";
    if (options.research !== false) {
      try {
        evidence = evidenceText(await research(readable(identity)));
      } catch {
        // Best effort. An unreachable network makes the Teacher recall rather than stop.
      }
    }

    const taughtResult = await teach(
      runtime.store,
      { identity, message: `Teach me about ${readable(identity)}.`, expression: `${identity}()`, evidence },
      options,
    );
    if (!taughtResult.declaration) {
      record({
        identity, depth, how: "failed",
        detail: taughtResult.problem ?? "no declaration", discovered: [],
      });
      continue;
    }

    let saved: Expr;
    try {
      saved = await runtime.evaluate(taughtResult.declaration, c("Execution"));
    } catch (caught) {
      record({
        identity, depth, how: "failed",
        detail: caught instanceof ConceptError ? format(caught.value) : String(caught),
        discovered: [],
      });
      continue;
    }

    // A refused body names what it needed first. Those are prerequisites, so they are
    // queued at this depth rather than deeper — they are not a digression.
    const needed: string[] = [];
    for (const node of walk(saved)) {
      if (!isCall(node) || node.head !== "NeedsFirst") continue;
      for (const item of walk(node)) {
        if (isCall(item) && item.head !== "NeedsFirst" && item.head !== "List") needed.push(item.head);
      }
    }

    const unit = runtime.store.get(identity);
    const learned = (unit?.relations.length ?? 0) + (unit?.realizations.length ?? 0);
    const discovered = [
      ...push(needed, depth),
      ...push(frontierFrom(unit?.relations ?? []), depth + 1),
    ];

    if (learned > 0) {
      taught += 1;
      record({ identity, depth, how: "taught", detail: format(saved), discovered });
      options.onProgress?.();
    } else {
      record({ identity, depth, how: "refused", detail: format(saved), discovered });
    }
  }

  return { steps, taught, visited, remaining: queue.map((q) => q.identity) };
}
