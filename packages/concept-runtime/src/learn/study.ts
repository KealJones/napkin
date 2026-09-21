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
import { claims } from "../concept/unit.js";
import type { ModelOptions } from "../ears/ollama.js";
import { ConceptError } from "../runtime/errors.js";
import type { Runtime } from "../runtime/evaluator.js";
import { c, format } from "../concept/expression.js";
import { evidenceText, research } from "../research/sources.js";
import { passages, type Document } from "./reading.js";
import { fromGraph, readable } from "./learn.js";
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
   * `attached`  — connected to a realizable neighbour it already named, for free;
   * `taught`    — the Teacher produced a declaration and the graph changed;
   * `known`     — already understood, so it was harvested rather than taught;
   * `read`      — evidence was found for it, which is a note rather than an outcome;
   * `refused`   — a declaration came back and saved nothing;
   * `failed`    — no usable declaration.
   */
  readonly how: "taught" | "attached" | "known" | "read" | "refused" | "failed";
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
  /**
   * Documents to take evidence from instead of the web. For a vocabulary the web would
   * get wrong -- this project's own terms, a house style, a domain with private meanings
   * -- the right source is the one that defines them.
   */
  reading?: readonly Document[];
  /** Off means crawl what is already known without asking the Teacher anything. */
  teacher?: boolean;
  /**
   * Express Concepts in this context rather than learning new ones, e.g. `TypeScript`.
   * The target inverts: a Concept the graph ALREADY has, with no realization carrying
   * this facet, is the gap. Without this, study skips everything it already understands,
   * so a seeded Concept like If could never be taught to emit a language.
   */
  as?: string;
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

/** Does anything this Concept can do already carry the facet? */
function speaks(runtime: Runtime, identity: string, facet: string): boolean {
  const unit = runtime.store.get(identity);
  if (!unit) return false;
  return unit.realizations.some((r) => {
    if (r.context === undefined) return false;
    for (const node of walk(r.context)) if (isCall(node) && node.head === facet) return true;
    return false;
  });
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

    // Expressing rather than learning: the gap is a Concept that works but is mute in
    // this context. One that the graph does not have at all is somebody else's job.
    if (options.as !== undefined) {
      const unit = runtime.store.get(identity);
      if (!unit) {
        record({ identity, depth, how: "failed", detail: "not in the graph", discovered: [] });
        continue;
      }
      // Requiring existing behaviour was wrong here. Function, Write and Says do nothing in
      // any context and are exactly the constructs a target language needs a rendering for
      // -- for a pure syntax Concept the emission realization may be the only one it ever
      // has. Whether something has a sensible rendering is a judgement the Teacher is
      // better placed to make than a heuristic, and CONTEXT_SYSTEM rule 7 already tells it
      // to return realizations=List() when the answer is no.
      if (speaks(runtime, identity, options.as)) {
        record({ identity, depth, how: "known", detail: `already speaks ${options.as}`, discovered: [] });
        continue;
      }
      if (options.teacher === false) {
        record({ identity, depth, how: "failed", detail: "no Teacher", discovered: [] });
        continue;
      }
      const before = unit.realizations.length;
      let lesson: Awaited<ReturnType<typeof teach>>;
      try {
        lesson = await teach(
          runtime.store,
          {
            identity,
            message: `Express ${readable(identity)} in ${options.as}.`,
            expression: `${identity}()`,
            inContext: `${options.as}()`,
            existing: unit.realizations.map((r) => `  ${format(r.pattern)}`).join("\n"),
          },
          options,
        );
      } catch (caught) {
        record({
          identity, depth, how: "failed",
          detail: caught instanceof Error ? caught.message : String(caught),
          discovered: [],
        });
        continue;
      }
      if (!lesson.declaration) {
        record({ identity, depth, how: "failed", detail: lesson.problem ?? "no declaration", discovered: [] });
        continue;
      }
      try {
        const saved = await runtime.evaluate(lesson.declaration, c("Execution"));
        const gained = (runtime.store.get(identity)?.realizations.length ?? 0) - before;
        if (gained > 0) {
          taught += 1;
          record({ identity, depth, how: "taught", detail: format(saved), discovered: [] });
          options.onProgress?.();
        } else {
          record({ identity, depth, how: "refused", detail: format(saved), discovered: [] });
        }
      } catch (caught) {
        record({
          identity, depth, how: "failed",
          detail: caught instanceof ConceptError ? format(caught.value) : String(caught),
          discovered: [],
        });
      }
      continue;
    }

    // Already understood: nothing to teach, but what it names is still worth following,
    // and it may be an island that a neighbour could give behaviour to.
    if (understood(runtime, identity)) {
      const discovered = push(frontierFrom(claims(runtime.store.get(identity)!)), depth + 1);
      const attached = fromGraph(runtime, identity);
      record({
        identity, depth,
        how: attached ? "attached" : "known",
        detail: attached ?? "already understood",
        discovered,
      });
      if (attached) options.onProgress?.();
      continue;
    }

    if (options.teacher === false) {
      record({ identity, depth, how: "failed", detail: "no Teacher", discovered: [] });
      continue;
    }

    let evidence = "";
    if (options.reading?.length) {
      // Documents beat the web where they cover the term, and the web is not consulted
      // at all for a vocabulary it would answer confidently and wrongly.
      evidence = evidenceText(passages(options.reading, readable(identity)));
      if (evidence) {
        record({
          identity, depth, how: "read",
          detail: `${options.reading.length} document(s)`, discovered: [],
        });
      }
    }
    if (!evidence && options.research !== false) {
      try {
        evidence = evidenceText(await research(readable(identity)));
      } catch {
        // Best effort. An unreachable network makes the Teacher recall rather than stop.
      }
    }

    let taughtResult: Awaited<ReturnType<typeof teach>>;
    try {
      taughtResult = await teach(
        runtime.store,
        { identity, message: `Teach me about ${readable(identity)}.`, expression: `${identity}()`, evidence },
        options,
      );
    } catch (caught) {
      // A generation that times out is one lost topic, not a lost run. An overnight crawl
      // that dies on its fifth Concept because one call was slow is worthless.
      record({
        identity, depth, how: "failed",
        detail: caught instanceof Error ? caught.message : String(caught),
        discovered: [],
      });
      continue;
    }
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
      ...push(frontierFrom(unit ? claims(unit) : []), depth + 1),
    ];

    if (learned > 0) {
      taught += 1;
      record({ identity, depth, how: "taught", detail: format(saved), discovered });
      // Try the graph before the model, which here means AFTER the model: a Concept just
      // taught `SynonymOf(Something())` is an island until it is attached, and attaching
      // costs nothing. Without this a crawl builds synonyms that cannot do what their
      // twins can, so the same question phrased two ways computes once and residuals once.
      const attached = fromGraph(runtime, identity);
      if (attached) record({ identity, depth, how: "attached", detail: attached, discovered: [] });
      options.onProgress?.();
    } else {
      record({ identity, depth, how: "refused", detail: format(saved), discovered });
    }
  }

  return { steps, taught, visited, remaining: queue.map((q) => q.identity) };
}
