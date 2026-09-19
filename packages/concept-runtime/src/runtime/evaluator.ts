/**
 * The evaluation loop.
 *
 * The load-bearing rule is residual evaluation (concept-spec Part 8.1): an expression with
 * no applicable realization evaluates to ITSELF. It is not an error, it is a value. An
 * absent Concept behaves identically to a missing realization (Part 8.2) — if an unknown
 * identity raised, invention would be fatal, and invention is how gaps are discovered.
 *
 * The loop knows six identities, all structural, never semantic (concept-spec Part 17.1):
 * Concept, Realization, Code, Context, Suppresses, IsA. It does not know that Multiply
 * exists.
 */
import {
  type Argument,
  type Call,
  type Expr,
  call,
  equal,
  format,
  isCall,
  isVariable,
  parse,
} from "../concept/expression.js";
import { ANON, type Bindings, match, substitute } from "../concept/match.js";
import { codeSource, isCodeBody, type Realization } from "../concept/unit.js";
import { CellStore } from "../store/cells.js";
import { Relations } from "../store/relations.js";
import { ConceptStore } from "../store/store.js";
import { suppressedProperties } from "./context.js";
import { budget, ConceptError, executionFailed, unbound } from "./errors.js";
import { bestCandidate, candidates, incomparable } from "./select.js";
import { Trace } from "./trace.js";

export interface RuntimeOptions {
  maximumDepth?: number;
  maximumSteps?: number;
}

/** What a Code(...) body receives. Every realization reaches the host the same way. */
export interface CodeApi {
  readonly store: ConceptStore;
  readonly cells: CellStore;
  readonly relations: Relations;
  readonly trace: Trace;
  evaluate(expression: Expr, context?: Expr): Promise<Expr>;
  substitute(expression: Expr, bindings: Bindings): Expr;
  parse(source: string): Expr;
  /** Ambient facts about this turn, e.g. the message being answered, for deixis. */
  ambient(key: string): string | undefined;
  format(e: Expr): string;
  call(head: string, ...values: Expr[]): Call;
}

export class Runtime {
  readonly store: ConceptStore;
  readonly cells = new CellStore();
  readonly relations: Relations;
  readonly trace = new Trace();
  readonly maximumDepth: number;
  readonly maximumSteps: number;
  private steps = 0;
  /** Ambient state a deictic realization reads instead of its arguments. */
  readonly context = new Map<string, string>();
  /** Incomparable context matches, surfaced rather than silently resolved. */
  readonly ambiguities: string[] = [];

  constructor(store = new ConceptStore(), options: RuntimeOptions = {}) {
    this.store = store;
    this.relations = new Relations(store);
    this.maximumDepth = options.maximumDepth ?? 64;
    this.maximumSteps = options.maximumSteps ?? 4000;
  }

  /** Where the current attempt starts in the trace. Earlier attempts are history. */
  private mark = 0;
  get attemptStart(): number {
    return this.mark;
  }

  reset(): void {
    this.steps = 0;
    this.ambiguities.length = 0;
    this.mark = this.trace.mark();
  }

  async evaluate(expression: Expr, context?: Expr): Promise<Expr> {
    return this.run(expression, context, "Entry", undefined, 0);
  }

  private async run(
    expression: Expr,
    context: Expr | undefined,
    caller: string,
    parent: string | undefined,
    depth: number,
  ): Promise<Expr> {
    if (expression === null || typeof expression !== "object") return expression;
    // `$_` is the anonymous unknown, not a binding anyone forgot to make. It means "this
    // is the part I do not have", so it evaluates to itself and leaves the call around it
    // residual — the same honest outcome as a Concept with no realization. Raising here
    // turned "can you do the math?" into UnboundVariable instead of a question.
    if (isVariable(expression)) {
      if (expression.variable === ANON) return expression;
      unbound(expression.variable);
    }

    const target = expression as Call;
    const id = this.trace.start({
      parentEventId: parent,
      concept: target.head,
      caller,
      depth,
      useContext: context,
      input: target,
      arguments: target.args.map((a) => a.value),
    });

    try {
      this.steps += 1;
      if (depth > this.maximumDepth) budget("depth", this.maximumDepth);
      if (this.steps > this.maximumSteps) budget("steps", this.maximumSteps);

      const suppressed = suppressedProperties(context, (identity) => [
        ...(this.store.get(identity)?.relations ?? []),
      ]);

      const found = candidates(this.store, target, context, suppressed);
      if (incomparable(found)) {
        this.ambiguities.push(
          `${format(target)} matched ${found.length} equally specific realizations on different facets`,
        );
      }
      const chosen = found[0];

      // No Concept, or no applicable realization: the expression is its own value.
      if (!chosen) {
        this.trace.finish(id, "residual", target);
        return target;
      }

      this.trace.select(id, chosen.realization);
      this.store.recordSelection(chosen.owner, chosen.index);
      const { realization } = chosen;
      let bindings = chosen.bindings;
      let args: readonly Argument[] = target.args;

      if (realization.evaluateArguments) {
        args = await Promise.all(
          target.args.map(async (a) => {
            const value = await this.run(a.value, context, target.head, id, depth + 1);
            return a.name === undefined ? { value } : { name: a.name, value };
          }),
        );
        const evaluated = call(target.head, args);
        this.trace.evaluated(id, args.map((a) => a.value));
        bindings = new Map();
        if (!match(realization.pattern, evaluated, bindings)) {
          this.trace.finish(id, "residual", evaluated);
          return evaluated;
        }
      }

      const bodyContext =
        realization.resultContext === undefined
          ? context
          : substitute(realization.resultContext, bindings);

      let result: Expr;
      if (isCodeBody(realization.body)) {
        result = await this.runCode(realization, bindings, args, bodyContext, id, depth);
      } else {
        const body = substitute(realization.body, bindings);
        result = await this.run(body, bodyContext, target.head, id, depth + 1);
      }

      if (realization.evaluateResult) {
        result = await this.run(result, bodyContext, target.head, id, depth + 1);
      }

      // A realization that hands back the call it was given did nothing. That is a
      // residual in substance even though one was selected, and treating it as success is
      // what let "I could not work that out" stand in for a missing realization.
      if (equal(result, call(target.head, args))) {
        this.trace.finish(id, "residual", result);
        return result;
      }

      this.trace.finish(id, "success", result);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const value =
        caught instanceof ConceptError ? caught.value : executionFailed(target.head, message);
      this.trace.finish(id, "failure", value, message);
      throw caught instanceof ConceptError ? caught : new ConceptError(value, message);
    }
  }

  private async runCode(
    realization: Realization,
    bindings: Bindings,
    args: readonly Argument[],
    context: Expr | undefined,
    parent: string,
    depth: number,
  ): Promise<Expr> {
    const source = codeSource(realization.body);
    if (source === undefined) {
      throw new Error("A Code body needs a source string");
    }
    const api: CodeApi = {
      store: this.store,
      cells: this.cells,
      relations: this.relations,
      trace: this.trace,
      evaluate: (expression, ctx) =>
        this.run(expression, ctx ?? context, "Code", parent, depth + 1),
      substitute,
      parse,
      ambient: (key) => this.context.get(key),
      format,
      call: (head, ...values) => call(head, values.map((value) => ({ value }))),
    };
    const fn = new Function("args", "bindings", "api", `return (${source})(args, bindings, api);`) as (
      a: readonly Argument[],
      b: Bindings,
      c: CodeApi,
    ) => Expr | Promise<Expr>;
    return await fn(args, bindings, api);
  }
}

export { ConceptError };
