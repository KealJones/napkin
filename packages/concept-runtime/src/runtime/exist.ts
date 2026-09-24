/**
 * Exist: continuous operation without being asked (concept-spec Part 16.1).
 *
 * It needs no goal source invented for it, because **the agenda is already written down.**
 * Every residual is something the system could not realize, every orphan is a cluster
 * attached to nothing, every undescribed Concept is a gap in its own understanding. All of
 * it is a by-product of ordinary operation.
 *
 * So existing is reading its own history for what it could not do, and working on it.
 * Choosing what to work on next is a policy, kept here rather than in a scheduler, and
 * bounded by an explicit envelope: it may research and learn, and nothing else.
 */
import { c, format, isCall, type Expr } from "../concept/expression.js";
import { learn } from "../learn/learn.js";
import type { ModelOptions } from "../ears/ollama.js";
import { orphans } from "../store/forget.js";
import { Relations } from "../store/relations.js";
import type { Runtime } from "./evaluator.js";
import { reachesBehaviour } from "./select.js";

export interface Intent {
  readonly what: "learn" | "attach" | "describe" | "consolidate";
  readonly identity: string;
  readonly why: string;
}

export interface ExistOptions extends ModelOptions {
  /** Stop after this many intents. Unattended work must be bounded. */
  budget?: number;
  /** Pause between intents, so it does not saturate the machine. */
  restMs?: number;
  onIntent?: (intent: Intent, outcome: string) => void;
  signal?: AbortSignal;
}

/**
 * What to work on next, read off the graph. Ordered by how cheap the fix is, so the free
 * repairs happen before anything asks a model.
 */
export function agenda(runtime: Runtime, limit = 16): Intent[] {
  const out: Intent[] = [];
  const relations = new Relations(runtime.store);
  const realizable = (id: string) => (runtime.store.get(id)?.realizations.length ?? 0) > 0;

  // Cheapest: a Concept whose cluster contains behaviour it is not actually connected to.
  // Inheritance counts as connected, so anything reaching a realization through IsA is
  // already fine and must not be flagged.
  for (const unit of runtime.store.all()) {
    if (reachesBehaviour(runtime.store, unit.identity)) continue;
    const sibling = relations.cluster(unit.identity, 24, true).find((x) => realizable(x.identity));
    if (sibling) {
      out.push({
        what: "attach",
        identity: unit.identity,
        why: `reaches ${sibling.identity}, which realizes, but is not attached to it`,
      });
    }
  }

  // Then: known to nothing. An orphan is the actual defect.
  for (const id of orphans(runtime.store, (id) => reachesBehaviour(runtime.store, id))) {
    out.push({ what: "learn", identity: id, why: "no relations, no realizations, reaches nothing" });
  }

  // Then: residuals from real turns, which are the things it was actually asked for.
  for (const event of runtime.trace.residuals()) {
    if (runtime.store.has(event.concept)) continue;
    out.push({ what: "learn", identity: event.concept, why: `left residual in ${event.input}` });
  }

  // Consolidation (memory-spec Part 11): only worth trying when a conversation has
  // actually said something. `Consolidate` itself is idempotent, so proposing it whenever
  // there is anything to check costs nothing when there is not yet enough evidence.
  const hasSaid = runtime.store
    .all()
    .some(
      (unit) =>
        /^(Conversation_|IsolatedConversation_)/.test(unit.identity) &&
        unit.relations.some((r) => isCall(r.claim) && r.claim.head === "Said"),
    );
  if (hasSaid) {
    out.push({ what: "consolidate", identity: "Consolidate", why: "repeated happenings may have reached the evidence threshold" });
  }

  const seen = new Set<string>();
  return out.filter((i) => (seen.has(i.identity) ? false : (seen.add(i.identity), true))).slice(0, limit);
}

export async function exist(runtime: Runtime, options: ExistOptions = {}): Promise<Intent[]> {
  const budget = options.budget ?? 4;
  const done: Intent[] = [];

  for (const intent of agenda(runtime, budget)) {
    if (options.signal?.aborted) break;
    let outcome: string;
    try {
      if (intent.what === "consolidate") {
        // Not a model call: consolidation is a deterministic pass over what was already
        // said, the same reason `--forget`'s realization collection never asks a model.
        outcome = format(await runtime.evaluate(c("Consolidate"), c("Execution")));
      } else {
        const result = await learn(
          runtime,
          `existing: ${intent.why}`,
          c(intent.identity),
          c("Execution"),
          { ...options, maxPasses: 1 },
        );
        outcome = result.steps.length
          ? result.steps.map((s) => `${s.how}: ${s.detail}`).join("; ")
          : "nothing learned";
      }
    } catch (caught) {
      outcome = `failed: ${caught instanceof Error ? caught.message : String(caught)}`;
    }
    done.push(intent);
    options.onIntent?.(intent, outcome);
    if (options.restMs) await new Promise((r) => setTimeout(r, options.restMs));
  }
  return done;
}

/** A readable snapshot of what it would do next, without doing it. */
export const describeAgenda = (runtime: Runtime): string =>
  agenda(runtime)
    .map((i) => `${i.what.padEnd(9)} ${i.identity.padEnd(24)} ${i.why}`)
    .join("\n") || "nothing to do";
