/**
 * The trace, kept (concept-spec Part 13: durable, append-only).
 *
 * This is not a fourth store. It is the third one actually lasting past the process, which
 * is what lets it be read as evidence later (`emergent-judgment-plan.md` Part 3.1). Each
 * event carries the `seq` of its turn's `Said` stamp, so it joins to memory without a
 * second copy of the parse.
 *
 * One JSON line per event, appended, never rewritten. Expressions are stored as text, the
 * same way the graph stores them.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { format, type Expr } from "../concept/expression.js";
import type { TraceEvent } from "../runtime/trace.js";

/**
 * A stored event. Host exchanges keep what happened and drop the bodies: a model prompt is
 * kilobytes per call, and the trace is kept for what was selected and how it went.
 */
export interface StoredTraceEvent {
  id: string;
  traceId: string;
  saidSeq: number | null;
  parentEventId: string | null;
  concept: string;
  caller: string;
  useContext: string;
  input: string;
  selectedRealization: string | null;
  /** Stable across processes, so evidence about a realization survives it being forgotten. */
  realizationHash: string | null;
  output: string | null;
  outcome: TraceEvent["outcome"];
  error: string | null;
  startedAt: string;
  durationMs: number | null;
  exchanges: { url: string; method: string; status: number | null; error: string | null }[];
}

export const realizationHash = (r: Expr): string => createHash("sha256").update(format(r)).digest("hex").slice(0, 16);

const toStored = (e: TraceEvent): StoredTraceEvent => ({
  id: e.id,
  traceId: e.traceId,
  saidSeq: e.saidSeq,
  parentEventId: e.parentEventId,
  concept: e.concept,
  caller: e.caller,
  useContext: format(e.useContext),
  input: format(e.input),
  selectedRealization: e.selectedRealization === null ? null : format(e.selectedRealization),
  realizationHash: e.selectedRealization === null ? null : realizationHash(e.selectedRealization),
  output: e.output === null ? null : format(e.output),
  outcome: e.outcome,
  error: e.error,
  startedAt: e.startedAt,
  durationMs: e.durationMs,
  exchanges: e.externalExchanges.map((x) => ({
    url: x.url,
    method: x.method,
    status: x.responseStatus,
    error: x.error,
  })),
});

export function appendTrace(path: string, events: readonly TraceEvent[]): number {
  if (!events.length) return 0;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, events.map((e) => JSON.stringify(toStored(e))).join("\n") + "\n", "utf8");
  return events.length;
}

/** Every stored event, oldest first. A torn last line from an interrupted write is skipped. */
export function readTrace(path: string): StoredTraceEvent[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: StoredTraceEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as StoredTraceEvent);
    } catch {
      continue;
    }
  }
  return out;
}
