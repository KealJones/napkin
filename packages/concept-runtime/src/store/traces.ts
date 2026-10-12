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
import { append, read, digest, write } from "#platform";
import { isCall } from "../concept/expression.js";
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
  /** How many realizations matched, before any tie-break (emergent-judgment-plan.md Phase 0). */
  candidateCount: number;
  /** Whether a tie-break, not specificity, decided (concept-spec Part 9.4). Evidence and
   * blame only ever read events where this is true. */
  tieBroken: boolean;
}

export const realizationHash = (r: Expr): string => digest(format(r)).slice(0, 16);

/** Shared with the evidence cache (`runtime/evidence.ts`), so a freshly written event is
 * indexed the same way a reloaded one is. */
/**
 * What is kept of an expression in the trace file: whole up to a few thousand characters, then cut
 * with an ellipsis. The file is a record to read back, not the expressions themselves.
 */
const KEPT = 4000;
const kept = (text: string): string => (text.length > KEPT ? `${text.slice(0, KEPT)}…` : text);
/**
 * The realization chosen, as kept: its pattern and context, without its body. The body was nine
 * tenths of the file, repeated on every step; the hash, taken from the whole realization, is what
 * evidence reads, and the live studio is sent the whole of it.
 */
const withoutBody = (r: Expr): Expr => (isCall(r) ? { head: r.head, args: r.args.filter((a) => a.name !== "body") } : r);

export const toStored = (e: TraceEvent): StoredTraceEvent => ({
  id: e.id,
  traceId: e.traceId,
  saidSeq: e.saidSeq,
  parentEventId: e.parentEventId,
  concept: e.concept,
  caller: e.caller,
  useContext: format(e.useContext),
  input: kept(format(e.input)),
  selectedRealization: e.selectedRealization === null ? null : kept(format(withoutBody(e.selectedRealization))),
  realizationHash: e.selectedRealization === null ? null : realizationHash(e.selectedRealization),
  output: e.output === null ? null : kept(format(e.output)),
  outcome: e.outcome,
  error: e.error,
  startedAt: e.startedAt,
  durationMs: e.durationMs,
  candidateCount: e.candidateCount,
  tieBroken: e.tieBroken,
  exchanges: e.externalExchanges.map((x) => ({
    url: x.url,
    method: x.method,
    status: x.responseStatus,
    error: x.error,
  })),
});

/** Most the trace file holds, in characters (about bytes): past it, the oldest turns are let go. */
export const TRACE_LIMIT = 20_000_000;
/** How much is appended between looks at the file's size. */
const LOOK_EVERY = 2_000_000;
const appendedSince = new Map<string, number>();

export function appendTrace(path: string, events: readonly TraceEvent[], limit = TRACE_LIMIT): number {
  if (!events.length) return 0;
  const text = events.map((e) => JSON.stringify(toStored(e))).join("\n") + "\n";
  append(path, text);
  const since = (appendedSince.get(path) ?? 0) + text.length;
  appendedSince.set(path, since);
  if (since >= Math.min(LOOK_EVERY, limit / 4)) {
    appendedSince.set(path, 0);
    boundTrace(path, limit);
  }
  return events.length;
}

/**
 * Keep the trace file under `limit`: past it, the newest turns that fit in half the limit are kept
 * whole and the rest let go, written beside it and renamed. Evidence about the oldest selections
 * goes with them; what was learned from them is in the graph, not here.
 */
export function boundTrace(path: string, limit = TRACE_LIMIT): number {
  const text = read(path);
  if (text === undefined || text.length <= limit) return 0;
  const lines = text.split("\n").filter((l) => l.trim());
  let size = 0;
  let from = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (size + lines[i].length + 1 > limit / 2) break;
    size += lines[i].length + 1;
    from = i;
  }
  // A turn is kept whole or not at all: start where a turn starts.
  const turnOf = (line: string | undefined) => (line ? /"traceId":"([^"]*)"/.exec(line)?.[1] : undefined);
  while (from > 0 && from < lines.length && turnOf(lines[from]) === turnOf(lines[from - 1])) from += 1;
  write(path, lines.slice(from).join("\n") + (from < lines.length ? "\n" : ""));
  return from;
}

/** Every stored event, oldest first. A torn last line from an interrupted write is skipped. */
export function readTrace(path: string): StoredTraceEvent[] {
  const text = read(path);
  if (text === undefined) return [];
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

/**
 * Drop every event of these turns. The trace holds each turn's parse, so forgetting the
 * words has to reach it too (memory-spec Part 10.5). The one rewrite of an append-only
 * file, written beside it and renamed so an interruption cannot leave half a trace.
 */
export function dropTurns(path: string, saidSeqs: ReadonlySet<number>): number {
  const events = readTrace(path);
  const kept = events.filter((e) => e.saidSeq === null || !saidSeqs.has(e.saidSeq));
  if (kept.length === events.length) return 0;
  write(path, kept.map((e) => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : ""));
  return events.length - kept.length;
}
