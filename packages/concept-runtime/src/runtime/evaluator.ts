import { randomUUID } from "node:crypto";
import { Script, createContext } from "node:vm";
import {
  application,
  formatExpression,
  isApplication,
  isExpr,
  namedArgument,
  parseExpression,
  type Argument,
  type Expr,
} from "../concept/expression.js";
import type { ConceptUnit } from "../concept/unit.js";
import { SQLiteConceptStore } from "../store/sqlite-store.js";
import type { ExternalExchange, TraceEvent } from "./trace.js";

const realizationHead = "Realization";
const codeHead = "Code";

export interface EvaluationRequest {
  input: Expr;
  useContext: Expr;
  caller: string;
  persistTrace?: boolean;
  onTrace?: (event: TraceEvent) => void;
}

export interface EvaluationResult {
  value: Expr;
  traceId: string;
}

export interface EvaluatorOptions {
  maximumSteps?: number;
  maximumDepth?: number;
  codeTimeoutMs?: number;
  runtimeEntryConcept?: string;
  httpRequestAdapter?: HttpRequestAdapter;
}

export interface HttpRequestInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponseOutput {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type HttpRequestAdapter = (
  request: HttpRequestInput,
) => Promise<HttpResponseOutput>;

type EvaluationCallback = (
  expression: Expr,
  useContext?: Expr,
) => Promise<Expr>;

interface EvaluationState {
  traceId: string;
  nextSequence: number;
  events: Map<string, TraceEvent>;
  persistTrace: boolean;
  onTrace: ((event: TraceEvent) => void) | undefined;
}

interface RuntimeAPI {
  entryConcept: string;
  rootEventId: string;
  maximumSteps: number;
  maximumDepth: number;
  evaluate: EvaluationCallback | undefined;
  getConcept(identity: string): ConceptUnit | undefined;
  saveConcept(unit: ConceptUnit): ConceptUnit;
  searchConcepts(query: string, limit: number): ConceptUnit[];
  parseExpression(source: string): Expr;
  formatExpression(expression: Expr): string;
  match(pattern: Expr, value: Expr, bindings: Record<string, Expr>): boolean;
  substitute(expression: Expr, bindings: Record<string, Expr>): Expr;
  startEvent(input: {
    concept: string;
    caller: string;
    parentEventId: string | null;
    useContext: Expr;
    input: Expr;
    arguments: Expr[];
  }): string;
  updateEvent(eventId: string, updates: Partial<TraceEvent>): void;
  finishEvent(
    eventId: string,
    result: Pick<TraceEvent, "output" | "outcome"> &
      Partial<Pick<TraceEvent, "error" | "evaluatedArguments">>,
  ): void;
  runCode(
    code: Expr,
    args: Argument[],
    useContext: Expr,
    parentEventId: string | null,
    evaluate: EvaluationCallback,
  ): Promise<Expr>;
  httpRequest(request: HttpRequestInput): Promise<HttpResponseOutput>;
}

class EvaluationFault extends Error {
  constructor(
    readonly value: Expr,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationFault";
  }
}

export class ConceptEvaluator {
  private readonly maximumSteps: number;
  private readonly maximumDepth: number;
  private readonly codeTimeoutMs: number;
  private readonly runtimeEntryConcept: string;
  private readonly httpRequestAdapter: HttpRequestAdapter;

  constructor(
    private readonly store: SQLiteConceptStore,
    options: EvaluatorOptions = {},
  ) {
    this.maximumSteps = options.maximumSteps ?? 2_000;
    this.maximumDepth = options.maximumDepth ?? 128;
    this.codeTimeoutMs = options.codeTimeoutMs ?? 1_000;
    this.runtimeEntryConcept = options.runtimeEntryConcept ?? "RuntimeEntry";
    this.httpRequestAdapter = options.httpRequestAdapter ?? sendHttpRequest;
  }

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const traceId = randomUUID();
    const startedAt = new Date().toISOString();
    const persistTrace = request.persistTrace ?? true;
    if (persistTrace) this.store.beginTrace(traceId, startedAt);
    const state: EvaluationState = {
      traceId,
      nextSequence: 0,
      events: new Map(),
      persistTrace,
      onTrace: request.onTrace,
    };
    const entryCall = application(this.runtimeEntryConcept, [
      { name: "input", value: request.input },
      { name: "useContext", value: request.useContext },
    ]);
    const rootEventId = this.startEvent(
      state,
      this.runtimeEntryConcept,
      request.caller,
      null,
      request.useContext,
      entryCall,
      [request.input, request.useContext],
    );
    let value: Expr;

    try {
      const entry = this.store.getConcept(this.runtimeEntryConcept);
      if (!entry) {
        throw new EvaluationFault(
          application("UnknownConcept", [
            { name: "identity", value: this.runtimeEntryConcept },
          ]),
          "No runtime-entry Concept exists for " + this.runtimeEntryConcept,
        );
      }
      const selected = this.selectEntry(entry, entryCall, request.useContext);
      if (!selected || !isCodeExpression(selected.body)) {
        throw new EvaluationFault(
          application("InvalidRuntimeEntry", [
            { name: "identity", value: this.runtimeEntryConcept },
          ]),
          "The configured runtime-entry Concept needs an applicable code realization",
        );
      }
      state.events.get(rootEventId)!.selectedRealization = structuredClone(
        selected.expression,
      );
      this.emitEvent(state, state.events.get(rootEventId)!);

      const api = this.createRuntimeAPI(
        state,
        rootEventId,
        rootEventId,
        undefined,
      );
      value = await this.runCode(
        selected.body,
        [
          { name: "input", value: request.input },
          { name: "useContext", value: request.useContext },
        ],
        request.useContext,
        api,
      );
      this.finishEvent(state, rootEventId, {
        output: value,
        outcome: "success",
      });
    } catch (error) {
      const carriedValue =
        typeof error === "object" &&
        error !== null &&
        "value" in error &&
        isExpr(error.value)
          ? error.value
          : undefined;
      const fault =
        error instanceof EvaluationFault
          ? error
          : new EvaluationFault(
              carriedValue ??
                application("ExecutionFailed", [
                  { name: "concept", value: this.runtimeEntryConcept },
                  { name: "message", value: errorMessage(error) },
                ]),
              errorMessage(error),
            );
      value = fault.value;
      this.finishEvent(state, rootEventId, {
        output: fault.value,
        outcome: "failure",
        error: fault.message,
      });
    } finally {
      if (persistTrace) {
        this.store.finishTrace({
          traceId,
          startedAt,
          endedAt: new Date().toISOString(),
        });
      }
    }
    return { value, traceId };
  }

  private selectEntry(
    unit: ConceptUnit,
    call: Expr,
    useContext: Expr,
  ): { expression: Expr; body: Expr; specificity: number } | undefined {
    const candidates: Array<{
      expression: Expr;
      body: Expr;
      specificity: number;
    }> = [];
    for (const expression of unit.realizations) {
      if (
        !isApplication(expression) ||
        expression.apply.head !== realizationHead
      ) {
        throw new EvaluationFault(
          application("InvalidRealization", [
            { name: "concept", value: unit.identity },
            { name: "realization", value: expression },
          ]),
          "A runtime-entry realization must use the generic Realization expression",
        );
      }
      const pattern = namedArgument(expression, "pattern");
      const body = namedArgument(expression, "body");
      const contextPattern = namedArgument(expression, "context");
      if (pattern === undefined || body === undefined) continue;
      const bindings = new Map<string, Expr>();
      if (!match(pattern, call, bindings)) continue;
      if (
        contextPattern !== undefined &&
        !match(contextPattern, useContext, bindings)
      ) {
        continue;
      }
      candidates.push({
        expression,
        body,
        specificity:
          contextPattern === undefined
            ? 0
            : structuralSpecificity(contextPattern),
      });
    }
    candidates.sort((left, right) => right.specificity - left.specificity);
    return candidates[0];
  }

  private createRuntimeAPI(
    state: EvaluationState,
    rootEventId: string,
    currentEventId: string,
    evaluate: EvaluationCallback | undefined,
  ): RuntimeAPI {
    return {
      entryConcept: this.runtimeEntryConcept,
      rootEventId,
      maximumSteps: this.maximumSteps,
      maximumDepth: this.maximumDepth,
      evaluate,
      getConcept: (identity) => this.store.getConcept(identity),
      saveConcept: (unit) => this.store.saveConcept(unit),
      searchConcepts: (query, limit) => this.store.searchConcepts(query, limit),
      parseExpression,
      formatExpression,
      match: (pattern, value, bindings) => {
        const map = new Map(Object.entries(bindings));
        const matched = match(pattern, value, map);
        for (const [key, bound] of map) bindings[key] = bound;
        return matched;
      },
      substitute: (expression, bindings) =>
        substitute(expression, new Map(Object.entries(bindings))),
      startEvent: (event) =>
        this.startEvent(
          state,
          event.concept,
          event.caller,
          event.parentEventId,
          event.useContext,
          event.input,
          event.arguments,
        ),
      updateEvent: (eventId, updates) => {
        const event = state.events.get(eventId);
        if (!event) throw new Error("Unknown trace event " + eventId);
        Object.assign(event, structuredClone(updates));
        this.emitEvent(state, event);
      },
      finishEvent: (eventId, result) => {
        this.finishEvent(state, eventId, result);
      },
      runCode: (code, args, context, parentEventId, callback) =>
        this.runCode(
          code,
          args,
          context,
          this.createRuntimeAPI(
            state,
            rootEventId,
            parentEventId ?? currentEventId,
            callback,
          ),
        ),
      httpRequest: (request) =>
        this.performHttpRequest(state, currentEventId, request),
    };
  }

  private startEvent(
    state: EvaluationState,
    concept: string,
    caller: string,
    parentEventId: string | null,
    useContext: Expr,
    input: Expr,
    args: Expr[],
  ): string {
    const startedMs = Date.now();
    const event: TraceEvent = {
      id: randomUUID(),
      traceId: state.traceId,
      sequence: state.nextSequence++,
      parentEventId,
      concept,
      caller,
      useContext: structuredClone(useContext),
      input: structuredClone(input),
      arguments: structuredClone(args),
      evaluatedArguments: null,
      selectedRealization: null,
      output: null,
      outcome: "running",
      error: null,
      startedAt: new Date(startedMs).toISOString(),
      endedAt: null,
      durationMs: null,
      externalExchanges: [],
    };
    state.events.set(event.id, event);
    this.emitEvent(state, event);
    return event.id;
  }

  private finishEvent(
    state: EvaluationState,
    eventId: string,
    result: Pick<TraceEvent, "output" | "outcome"> &
      Partial<Pick<TraceEvent, "error" | "evaluatedArguments">>,
  ): void {
    const event = state.events.get(eventId);
    if (!event) throw new Error("Unknown trace event " + eventId);
    Object.assign(event, structuredClone(result));
    const endedMs = Date.now();
    event.endedAt = new Date(endedMs).toISOString();
    event.durationMs = endedMs - Date.parse(event.startedAt);
    this.emitEvent(state, event);
  }

  private emitEvent(state: EvaluationState, event: TraceEvent): void {
    if (state.persistTrace) this.store.saveTraceEvent(event);
    try {
      state.onTrace?.(structuredClone(event));
    } catch {
      // Trace observers are best-effort and never affect Concept evaluation.
    }
  }

  private async runCode(
    code: Expr,
    args: Argument[],
    useContext: Expr,
    api: RuntimeAPI,
  ): Promise<Expr> {
    const source = namedArgument(code, "source");
    if (typeof source !== "string") {
      throw new EvaluationFault(
        application("InvalidCode", [{ name: "source", value: source ?? null }]),
        "Code realization source must be a string",
      );
    }

    const values: unknown[] = args.map((argument) => argument.value);
    for (const argument of args) {
      if (argument.name !== undefined) {
        Object.assign(values, { [argument.name]: argument.value });
      }
    }
    const context = createContext({
      args: values,
      useContext: structuredClone(useContext),
      api,
    });
    const script = new Script(
      "(() => { const realization = (" +
        source +
        "); return typeof realization === 'function' ? realization(args, api) : realization; })()",
      { filename: "concept-realization.js" },
    );
    const pending: unknown = script.runInContext(context, {
      timeout: this.codeTimeoutMs,
    });
    const result: unknown = await pending;
    if (!isExpr(result)) {
      throw new EvaluationFault(
        application("InvalidRealizationOutput", [
          { name: "value", value: String(result) },
        ]),
        "Code realization must return a primitive value or Concept expression",
      );
    }
    return structuredClone(result);
  }

  private async performHttpRequest(
    state: EvaluationState,
    eventId: string,
    request: HttpRequestInput,
  ): Promise<HttpResponseOutput> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      throw new EvaluationFault(
        application("InvalidHttpRequest", [
          { name: "url", value: request.url },
        ]),
        "HTTP request URL is invalid",
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new EvaluationFault(
        application("InvalidHttpRequest", [
          { name: "scheme", value: url.protocol },
        ]),
        "HTTP request only supports http and https",
      );
    }

    const method = (request.method ?? "GET").toUpperCase();
    const headers = request.headers ?? {};
    const body = request.body ?? null;
    const exchange: ExternalExchange = {
      url: url.toString(),
      method,
      requestHeaders: structuredClone(headers),
      requestBody: body,
      responseStatus: null,
      responseHeaders: null,
      responseBody: null,
      error: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    const event = state.events.get(eventId);
    if (event) {
      event.externalExchanges.push(exchange);
      this.emitEvent(state, event);
    }

    try {
      if (body !== null && Buffer.byteLength(body) > 2_000_000) {
        throw new Error("HTTP request body exceeds the 2 MB limit");
      }
      const response = await this.httpRequestAdapter({
        url: url.toString(),
        method,
        headers: structuredClone(headers),
        ...(body === null ? {} : { body }),
        timeoutMs: request.timeoutMs ?? 30_000,
      });
      if (Buffer.byteLength(response.body) > 4_000_000) {
        throw new Error("HTTP response body exceeds the 4 MB limit");
      }
      exchange.responseStatus = response.status;
      exchange.responseHeaders = structuredClone(response.headers);
      exchange.responseBody = response.body;
      exchange.endedAt = new Date().toISOString();
      if (event) this.emitEvent(state, event);
      return response;
    } catch (error) {
      exchange.error = errorMessage(error);
      exchange.endedAt = new Date().toISOString();
      if (event) this.emitEvent(state, event);
      throw new EvaluationFault(
        application("HttpRequestFailed", [
          { name: "url", value: url.toString() },
          { name: "method", value: method },
          { name: "message", value: exchange.error },
        ]),
        exchange.error,
      );
    }
  }
}

async function sendHttpRequest(
  request: HttpRequestInput,
): Promise<HttpResponseOutput> {
  const method = request.method ?? "GET";
  const response = await fetch(request.url, {
    method,
    headers: request.headers ?? {},
    ...(request.body === undefined ? {} : { body: request.body }),
    signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
  });
  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return { status: response.status, headers, body };
}

function isCodeExpression(
  expression: Expr,
): expression is ReturnType<typeof application> {
  return isApplication(expression) && expression.apply.head === codeHead;
}

function match(
  pattern: Expr,
  value: Expr,
  bindings: Map<string, Expr>,
): boolean {
  if (
    typeof pattern === "object" &&
    pattern !== null &&
    "variable" in pattern
  ) {
    const current = bindings.get(pattern.variable);
    if (current === undefined) {
      bindings.set(pattern.variable, structuredClone(value));
      return true;
    }
    return deepEqual(current, value);
  }
  if (isApplication(pattern)) {
    if (!isApplication(value)) return false;
    if (pattern.apply.head !== value.apply.head) return false;
    if (pattern.apply.args.length !== value.apply.args.length) return false;
    const expectedArguments = pattern.apply.args;
    const actualArguments = value.apply.args;
    const actualAreNamed = actualArguments.every(
      (argument) => argument.name !== undefined,
    );
    let alignedArguments = actualArguments;
    if (actualAreNamed) {
      const actualByName = new Map(
        actualArguments.map((argument) => [argument.name!, argument]),
      );
      if (actualByName.size !== actualArguments.length) return false;
      alignedArguments = expectedArguments
        .map((expected) => {
          const formalName =
            expected.name ??
            (typeof expected.value === "object" &&
            expected.value !== null &&
            "variable" in expected.value
              ? expected.value.variable
              : undefined);
          return formalName === undefined
            ? undefined
            : actualByName.get(formalName);
        })
        .filter((argument): argument is Argument => argument !== undefined);
      if (alignedArguments.length !== expectedArguments.length) return false;
    }
    for (let index = 0; index < expectedArguments.length; index += 1) {
      const expected = expectedArguments[index];
      const actual = alignedArguments[index];
      if (!expected || !actual) return false;
      if (
        !actualAreNamed &&
        expected.name !== undefined &&
        actual.name !== undefined &&
        expected.name !== actual.name
      ) {
        return false;
      }
      if (
        !actualAreNamed &&
        expected.name === undefined &&
        actual.name !== undefined &&
        typeof expected.value === "object" &&
        expected.value !== null &&
        "variable" in expected.value &&
        expected.value.variable !== actual.name
      ) {
        return false;
      }
      if (!match(expected.value, actual.value, bindings)) return false;
    }
    return true;
  }
  return Object.is(pattern, value);
}

function substitute(expression: Expr, bindings: Map<string, Expr>): Expr {
  if (
    typeof expression === "object" &&
    expression !== null &&
    "variable" in expression
  ) {
    return structuredClone(bindings.get(expression.variable) ?? expression);
  }
  if (!isApplication(expression)) return expression;
  const boundName =
    expression.apply.head === "Let"
      ? namedArgument(expression, "name")
      : expression.apply.head === "Try"
        ? (namedArgument(expression, "errorName") ?? "error")
        : undefined;
  const scopedBindings =
    typeof boundName === "string" &&
    (expression.apply.head === "Let" || expression.apply.head === "Try")
      ? new Map([...bindings].filter(([name]) => name !== boundName))
      : bindings;
  return application(
    expression.apply.head,
    expression.apply.args.map((argument) => {
      const argumentBindings =
        expression.apply.head === "Let" && argument.name === "body"
          ? scopedBindings
          : expression.apply.head === "Try" && argument.name === "catch"
            ? scopedBindings
            : bindings;
      const value = substitute(argument.value, argumentBindings);
      return argument.name === undefined
        ? { value }
        : { name: argument.name, value };
    }),
  );
}

function structuralSpecificity(expression: Expr): number {
  if (typeof expression !== "object" || expression === null) return 1;
  if ("variable" in expression) return 0;
  return (
    1 +
    expression.apply.args.reduce(
      (total, argument) => total + structuralSpecificity(argument.value),
      0,
    )
  );
}

function deepEqual(left: Expr, right: Expr): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
