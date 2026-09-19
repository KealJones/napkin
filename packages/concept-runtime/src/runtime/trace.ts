/**
 * Writing the trace is an ambient effect of evaluation; reading it is an ordinary Concept
 * (concept-spec Part 15.1). The split exists because selection consumes evidence from the
 * trace, so an unreadable trace would push selection policy into host code.
 *
 * The selected realization is recorded BY VALUE, not by reference, which is what makes
 * forgetting safe (concept-spec Part 13.2).
 */
import { type Expr, format } from "../concept/expression.js";
import type { Realization } from "../concept/unit.js";

export type Outcome = "success" | "residual" | "failure";

export interface TraceEvent {
  readonly id: number;
  readonly parent: number | undefined;
  readonly concept: string;
  readonly caller: string;
  readonly depth: number;
  readonly context: string;
  readonly input: string;
  selected?: { pattern: string; context: string; body: string };
  output?: string;
  outcome?: Outcome;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export class Trace {
  private readonly events: TraceEvent[] = [];
  private next = 0;

  start(e: Omit<TraceEvent, "id" | "startedAt">): number {
    const id = (this.next += 1);
    this.events.push({ ...e, id, startedAt: Date.now() });
    return id;
  }

  select(id: number, r: Realization): void {
    const event = this.byId(id);
    if (!event) return;
    event.selected = {
      pattern: format(r.pattern),
      context: r.context === undefined ? "any" : format(r.context),
      body: format(r.body),
    };
  }

  finish(id: number, outcome: Outcome, output: Expr, error?: string): void {
    const event = this.byId(id);
    if (!event) return;
    event.outcome = outcome;
    event.output = format(output);
    event.error = error;
    event.endedAt = Date.now();
  }

  byId(id: number): TraceEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  all(): readonly TraceEvent[] {
    return this.events;
  }

  /** Residual events are the learning path's work queue (concept-spec Part 12). */
  residuals(): TraceEvent[] {
    return this.events.filter((e) => e.outcome === "residual");
  }

  render(): string {
    return this.events
      .map((e) => {
        const pad = "  ".repeat(e.depth);
        const mark = e.outcome === "residual" ? "~" : e.outcome === "failure" ? "!" : " ";
        const sel = e.selected ? `  [${e.selected.context}]` : "";
        return `${mark} ${pad}${e.input}${sel}\n${mark} ${pad}  => ${e.output ?? "?"}`;
      })
      .join("\n");
  }
}
