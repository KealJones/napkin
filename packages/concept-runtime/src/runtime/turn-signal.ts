/**
 * Turn-level signals, read from the NEXT turn (emergent-judgment-plan.md Part 3.1, Phase 0
 * item 2).
 *
 * Derived at read time from consecutive `Said` relations of a conversation, joined to a
 * trace event by its `saidSeq` (concept-spec Part 15, memory-spec Part 13). Nothing here is
 * stored as a second copy of the parse: a signal is computed from the graph every time it
 * is asked for.
 *
 * The IR has no `Correction` head today. What exists is `MarkCorrection(old, new)`, which
 * marks a retraction WITHIN one utterance (`src/ears/parser/rules.ts`), and `Not(Ref(...))`
 * (reading-spec R19), which rejects a prior answer by reference, "no, not that one". A
 * retry, the same request said again, needs no parser support at all: it is visible as
 * two `Said(Me(), ...)` relations with equal parses. Those two are what this reads; a
 * turn-level `Correction` signal is not implemented because nothing in the Ears produces
 * one yet.
 */
import { equal, isCall, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";

export type FollowUpSignal = "negative" | "none";

/**
 * The signal carried by the turn that answered `saidSeq`, read from the conversation it
 * belongs to. `saidSeq` is store-wide and unique (memory-spec Part 4.2), so the conversation
 * holding it is found with `store.findStamp` rather than being passed in separately.
 */
export function followUpSignal(store: ConceptStore, saidSeq: number): FollowUpSignal {
  const found = store.findStamp(saidSeq);
  if (!found || !isCall(found.relation.claim) || found.relation.claim.head !== "Said") return "none";
  const current = found.relation.claim.args[1]?.value;
  if (current === undefined || typeof current === "string") return "none";

  const unit = store.get(found.identity);
  if (!unit) return "none";

  const mine: { seq: number; content: Expr }[] = [];
  for (const r of unit.relations) {
    if (!isCall(r.claim) || r.claim.head !== "Said") continue;
    const speaker = r.claim.args[0]?.value;
    if (!isCall(speaker) || speaker.head !== "Me") continue;
    const content = r.claim.args[1]?.value;
    if (content === undefined || typeof content === "string") continue;
    for (const stamp of r.stamps ?? []) mine.push({ seq: stamp.seq, content });
  }
  mine.sort((a, b) => a.seq - b.seq);
  const next = mine.find((m) => m.seq > saidSeq);
  if (!next) return "none";

  // Retry: the same request, said again, is the user trying once more because the first
  // attempt did not work.
  if (equal(current, next.content)) return "negative";
  // Explicit negation of a back-reference: "no, not that one".
  if (rejectsAReference(next.content)) return "negative";
  return "none";
}

function rejectsAReference(expr: Expr): boolean {
  if (!isCall(expr)) return false;
  if (expr.head === "MarkCorrection") return true;
  if (expr.head === "Not") {
    const arg = expr.args[0]?.value;
    if (arg !== undefined && isCall(arg) && arg.head === "Ref") return true;
  }
  return expr.args.some((a) => rejectsAReference(a.value));
}
