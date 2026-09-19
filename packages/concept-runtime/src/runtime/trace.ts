/**
 * Writing the trace is an ambient effect of evaluation; reading it is an ordinary Concept
 * (concept-spec Part 15.1). The split exists because selection consumes evidence from the
 * trace, so an unreadable trace would push selection policy into host code.
 *
 * Events carry Expr values rather than strings, so a reader can pretty-print or walk them
 * instead of parsing text back out. The selected realization is recorded BY VALUE, which
 * is what makes forgetting safe (concept-spec Part 13.2).
 */
import { type Expr, c, call, format } from "../concept/expression.js";
import type { Realization } from "../concept/unit.js";

export type TraceOutcome = "running" | "success" | "residual" | "failure";

/** A host call made while evaluating, so a model or network exchange is inspectable. */
export interface ExternalExchange {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TraceEvent {
  id: string;
  traceId: string;
  sequence: number;
  parentEventId: string | null;
  concept: string;
  caller: string;
  useContext: Expr;
  input: Expr;
  arguments: Expr[];
  evaluatedArguments: Expr[] | null;
  selectedRealization: Expr | null;
  output: Expr | null;
  outcome: TraceOutcome;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  externalExchanges: ExternalExchange[];
}

export interface EvaluationTrace {
  traceId: string;
  startedAt: string;
  endedAt: string;
}

export type TraceListener = (event: TraceEvent) => void;

/** A realization, as an expression, so the trace holds it by value. */
const realizationExpr = (r: Realization): Expr =>
  call("Realization", [
    { name: "pattern", value: r.pattern },
    ...(r.context === undefined ? [] : [{ name: "context", value: r.context }]),
    { name: "body", value: r.body },
  ]);

export class Trace {
  readonly traceId: string;
  private readonly events: TraceEvent[] = [];
  private readonly index = new Map<string, TraceEvent>();
  private next = 0;
  private readonly listeners = new Set<TraceListener>();
  private readonly startedAt = new Date().toISOString();

  constructor(traceId = `t${Date.now().toString(36)}`) {
    this.traceId = traceId;
  }

  /** Live observation, for the studio. */
  listen(listener: TraceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TraceEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  start(e: {
    parentEventId?: string | undefined;
    concept: string;
    caller: string;
    depth: number;
    useContext: Expr | undefined;
    input: Expr;
    arguments: Expr[];
  }): string {
    const sequence = (this.next += 1);
    const event: TraceEvent = {
      id: `e${sequence}`,
      traceId: this.traceId,
      sequence,
      parentEventId: e.parentEventId ?? null,
      concept: e.concept,
      caller: e.caller,
      useContext: e.useContext ?? c("Context"),
      input: e.input,
      arguments: [...e.arguments],
      evaluatedArguments: null,
      selectedRealization: null,
      output: null,
      outcome: "running",
      error: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      externalExchanges: [],
    };
    // Depth is not part of the event shape; it is recoverable from parentEventId, and
    // kept here only for the text renderer.
    this.depths.set(event.id, e.depth);
    this.events.push(event);
    this.index.set(event.id, event);
    this.emit(event);
    return event.id;
  }

  private readonly depths = new Map<string, number>();

  select(id: string, r: Realization): void {
    const event = this.index.get(id);
    if (!event) return;
    event.selectedRealization = realizationExpr(r);
    this.emit(event);
  }

  evaluated(id: string, args: Expr[]): void {
    const event = this.index.get(id);
    if (!event) return;
    event.evaluatedArguments = args;
    this.emit(event);
  }

  /** Attach a host exchange to the innermost running event, so it appears in context. */
  exchange(exchange: ExternalExchange, id?: string): void {
    const event = id ? this.index.get(id) : [...this.events].reverse().find((e) => e.outcome === "running");
    if (!event) return;
    event.externalExchanges.push(exchange);
    this.emit(event);
  }

  finish(id: string, outcome: Exclude<TraceOutcome, "running">, output: Expr, error?: string): void {
    const event = this.index.get(id);
    if (!event) return;
    event.outcome = outcome;
    event.output = output;
    event.error = error ?? null;
    event.endedAt = new Date().toISOString();
    event.durationMs = Date.parse(event.endedAt) - Date.parse(event.startedAt);
    this.emit(event);
  }

  byId(id: string): TraceEvent | undefined {
    return this.index.get(id);
  }

  all(): readonly TraceEvent[] {
    return this.events;
  }

  summary(): EvaluationTrace {
    return {
      traceId: this.traceId,
      startedAt: this.startedAt,
      endedAt: this.events[this.events.length - 1]?.endedAt ?? this.startedAt,
    };
  }

  /**
   * Where the trace currently ends. The learning loop evaluates the same expression
   * several times and the trace keeps every attempt, which is what makes it readable —
   * but a residual from an earlier attempt is not a gap once a later one succeeded.
   */
  mark(): number {
    return this.events.length;
  }

  /** Residual events are the learning path's work queue (concept-spec Part 12). */
  residuals(since = 0): TraceEvent[] {
    return this.events.slice(since).filter((e) => e.outcome === "residual");
  }

  render(): string {
    return this.events
      .map((e) => {
        const pad = "  ".repeat(this.depths.get(e.id) ?? 0);
        const mark = e.outcome === "residual" ? "~" : e.outcome === "failure" ? "!" : " ";
        const context = format(e.useContext);
        const shown = context === "Context()" ? "" : `  [${context}]`;
        return `${mark} ${pad}${format(e.input)}${shown}\n${mark} ${pad}  => ${
          e.output === null ? "?" : format(e.output)
        }`;
      })
      .join("\n");
  }
}
