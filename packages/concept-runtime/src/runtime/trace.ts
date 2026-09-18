import type { Expr } from "../concept/expression.js";

export type TraceOutcome = "running" | "success" | "residual" | "failure";

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
