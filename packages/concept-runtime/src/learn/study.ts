/**
 * Study: learning driven by topics rather than by gaps.
 *
 * The learning loop answers a question and teaches whatever that question happened to
 * need. That makes the graph's growth a side effect of what someone thought to ask, which
 * is a poor way to acquire a domain — asked to weigh a million dollars, the graph had
 * learned `Dollar` in the same turn it was asked to value it
 * (`design/judgment-research.md` Part 9.5).
 *
 * Study inverts the driver. Give it topics; it grounds each one in what the world says
 * (Wikidata, the dictionary), then follows what that revealed. Grounding `Money` yields
 * `IsA(MediumOfExchange())`, and `MediumOfExchange` is then a Concept the graph names but
 * does not know: a frontier to expand rather than a loose end.
 *
 * Everything it can reach is bounded: a budget of Concepts and a depth from the seeds.
 * Unbounded, a relation crawl reaches the whole of Wikidata.
 */
import { type Expr, c, call, format, isCall, walk } from "../concept/expression.js";
import type { ConceptUnit } from "../concept/unit.js";
import { activation } from "../runtime/activation.js";
import { groundInWikidata } from "../research/wikidata.js";
import type { Runtime } from "../runtime/evaluator.js";
import { fromGraph } from "./learn.js";

/** Structural identities and containers. Learning these would be learning the harness. */
const STRUCTURAL = new Set([
  "Concept", "Realization", "Code", "Context", "Suppresses", "IsA", "List", "Rest",
  "Saved", "Rejected", "NeedsFirst", "SelfReferential", "NotComposed", "Incomplete",
  "True", "False", "Number", "String", "Boolean",
  // How a relation is said, not what it names.
  "InverseOf", "SynonymOf", "Symmetric", "Transitive", "Asymmetric", "Functional", "Enduring", "Occurrent",
  "OppositeOf", "InverseOperation",
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
/**
 * The claims to follow: those that hold in any context. A sense-scoped one is about the
 * album or the game that shares the word's name, and following it spent the budget on
 * namesakes: studying volcano queued MusicAlbum and VideoGame.
 */
const general = (unit: Pick<ConceptUnit, "relations">): Expr[] =>
  unit.relations.filter((r) => r.context === undefined).map((r) => r.claim);

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
   * `grounded`  - Wikidata said what it is;
   * `defined`   - the dictionary said what it means;
   * `attached`  - connected to a realizable neighbour it already named, for free;
   * `known`     - already understood, so it was harvested rather than learned;
   * `failed`    - nothing sourced says anything about it.
   */
  readonly how: "grounded" | "defined" | "attached" | "known" | "failed";
  readonly detail: string;
  /** Concepts this step put on the frontier. */
  readonly discovered: readonly string[];
}

export interface StudyResult {
  readonly steps: StudyStep[];
  readonly learned: number;
  readonly visited: number;
  /** Reached the budget with these still queued. */
  readonly remaining: string[];
}

export interface StudyOptions {
  /** Concepts actually learned before stopping. Default 25. */
  maxConcepts?: number;
  /** How far from a seed topic the crawl may wander. Default 2. */
  maxDepth?: number;
  /** Off means crawl only what is already known, looking nothing up. */
  research?: boolean;
  /** Called after each step, so a long run is watchable. */
  onStep?: (step: StudyStep) => void;
  /** Called after each Concept learned, so a long run survives being killed. */
  onProgress?: () => void;
}

/** A Concept the graph holds and can say something about. */
function understood(runtime: Runtime, identity: string): boolean {
  const unit = runtime.store.get(identity);
  if (!unit) return false;
  // A retracted fact is no longer understanding, a Retracts is a record, not a fact, and a
  // Concept known only in narrow senses has not been taught what it means to everyone else.
  const holding = unit.relations.filter(
    (r) => r.context === undefined && !(isCall(r.claim) && r.claim.head === "Retracts") && !runtime.store.retracted(identity, r.claim),
  );
  return holding.length > 0 || unit.realizations.length > 0;
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
  /**
   * Each topic remembers how it was reached (studying Emoticon found TextRepresentation
   * through `IsA(TextRepresentation())`): the sense that makes the claim true is the one to
   * learn.
   */
  type Queued = { identity: string; depth: number; via?: { from: string; claim: string }; first?: true };
  const queue: Queued[] = topics
    .map((t) => ({ identity: identityFor(t), depth: 0 }))
    .filter((t) => t.identity.length > 0);
  const roots = queue.map((q) => q.identity);
  /**
   * The next topic is the one most relevant to what was asked, by activation spread from
   * the topics (memory-spec Part 10.1, emergent-judgment-plan Part 3.3), not the oldest
   * queued. Taken in order, emoji spent its budget on WebPage, Document and WebResource,
   * one associative hop at a time.
   */
  const next = (): Queued => {
    const first = queue.findIndex((q) => q.first);
    if (first >= 0) return queue.splice(first, 1)[0];
    if (queue.length > 1 && queue.some((q) => q.depth > 0)) {
      const ranked = activation(runtime.store, roots, { among: queue.map((q) => q.identity) }).map((a) => a.identity);
      const at = queue.findIndex((q) => q.identity === ranked[0]);
      if (at >= 0) return queue.splice(at, 1)[0];
    }
    return queue.shift()!;
  };

  let learned = 0;
  let visited = 0;

  const record = (step: StudyStep): void => {
    steps.push(step);
    options.onStep?.(step);
  };

  while (queue.length && learned < maxConcepts) {
    const { identity, depth } = next();
    if (seen.has(identity) || STRUCTURAL.has(identity)) continue;
    seen.add(identity);
    visited += 1;

    const push = (names: readonly string[], at: number, prerequisite = false): string[] => {
      const added = names.filter((n) => !seen.has(n) && !STRUCTURAL.has(n) && !queue.some((q) => q.identity === n));
      if (at <= maxDepth) for (const n of added) queue.push({ identity: n, depth: at, ...(prerequisite ? { first: true as const } : {}) });
      return added;
    };
    // What each claim names, remembered with the claim it was found in.
    const follow = (unit: Pick<ConceptUnit, "relations"> | undefined, at: number): string[] => {
      const found: string[] = [];
      for (const claim of unit ? general(unit) : []) {
        const names = push(frontierFrom([claim]), at);
        for (const n of names) {
          const q = queue.find((x) => x.identity === n);
          if (q && !q.via) q.via = { from: identity, claim: format(claim) };
        }
        found.push(...names);
      }
      return found;
    };

    // Already understood: nothing to learn, but what it names is still worth following,
    // and it may be an island that a neighbour could give behaviour to.
    if (understood(runtime, identity)) {
      const discovered = follow(runtime.store.get(identity), depth + 1);
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

    // What the world says, sourced and the same every time: Wikidata, then the dictionary.
    if (options.research !== false) {
      try {
        const grounded = await groundInWikidata(runtime.store, identity);
        if (grounded?.relations.length) {
          learned += 1;
          const discovered = follow(runtime.store.get(identity), depth + 1);
          record({ identity, depth, how: "grounded", detail: `${grounded.item}: ${grounded.relations.map(format).join(" ")}`, discovered });
          options.onProgress?.();
          continue;
        }
      } catch {
        // Unreachable: the dictionary may still say.
      }
      try {
        const meaning = await runtime.evaluate(call("Meaning", [{ value: c(identity) }]), c("Execution"));
        if (isCall(meaning) && meaning.head === "Meaning" && typeof meaning.args[1]?.value === "string") {
          learned += 1;
          record({ identity, depth, how: "defined", detail: meaning.args[1].value, discovered: follow(runtime.store.get(identity), depth + 1) });
          options.onProgress?.();
          continue;
        }
      } catch {
        // Unreachable is not an answer.
      }
    }
    record({ identity, depth, how: "failed", detail: "nothing sourced says", discovered: [] });
  }

  return { steps, learned, visited, remaining: queue.map((q) => q.identity) };
}
