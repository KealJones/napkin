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
import { claims, codeLanguage, codeSource, declares, isCodeBody, type Realization } from "../concept/unit.js";
import { CellStore } from "../store/cells.js";
import { Relations } from "../store/relations.js";
import { ConceptStore } from "../store/store.js";
import { dropTurns, realizationHash, type StoredTraceEvent } from "../store/traces.js";
import { facets, suppressedProperties } from "./context.js";
import { budget, ConceptError, executionFailed, unbound } from "./errors.js";
import { EvidenceStore, evidenceStoreFor, resetEvidenceCache } from "./evidence.js";
import { activation } from "./activation.js";
import { compiledFor } from "./compile.js";
import { bestCandidate, candidates, incomparable, tieBreakDecided, type Candidate } from "./select.js";
import { Trace, realizationExpr } from "./trace.js";

/**
 * Where a synonym forward points.
 *
 * Declared as a property, and read off the body for the ones already in a graph that were
 * derived before the property existed. Recognising the old shape costs three lines and
 * saves every saved graph a migration.
 */
function forwardTarget(r: Realization): string | undefined {
  const declared = r.properties.find((p) => isCall(p) && p.head === "Forwarding");
  if (declared && isCall(declared)) {
    const to = declared.args[0]?.value;
    if (isCall(to)) return to.head;
  }
  if (!isCodeBody(r.body)) return undefined;
  const source = codeSource(r.body) ?? "";
  if (!source.includes("api.evaluate({ head:")) return undefined;
  return /api\.evaluate\(\{ head: "([A-Za-z0-9_]+)"/.exec(source)?.[1];
}

export interface RuntimeOptions {
  maximumDepth?: number;
  maximumSteps?: number;
  /**
   * Languages this host can actually run. A Code body in anything else is refused rather
   * than attempted: `new Function(source)` will happily accept text that is valid in two
   * languages and mean something different in each, so a host that guesses is a host that
   * silently does the wrong thing.
   */
  speaks?: readonly string[];
  /**
   * Where this process's trace lives. When given, tier 3 selection reads evidence from it
   * instead of only recency (Phase 1), and the `Evidence(...)` Concept can query it through
   * `api.events`. Absent means no persisted trace: recency alone, as before Phase 1.
   */
  tracePath?: string;
}

/** What a Code(...) body receives. Every realization reaches the host the same way. */
export interface CodeApi {
  readonly store: ConceptStore;
  readonly cells: CellStore;
  readonly relations: Relations;
  readonly trace: Trace;
  evaluate(expression: Expr, context?: Expr): Promise<Expr>;
  /** A call to `head` with these values as its arguments, already evaluated, so not evaluated again. */
  apply(head: string, values: Expr[]): Promise<Expr>;
  substitute(expression: Expr, bindings: Bindings): Expr;
  parse(source: string): Expr;
  /** Ambient facts about this turn, e.g. the message being answered, for deixis. */
  ambient(key: string): string | undefined;
  /** The context this body was reached in, for a realization that must ask about it. */
  readonly context: Expr | undefined;
  format(e: Expr): string;
  call(head: string, ...values: Expr[]): Call;
  /**
   * Every stored trace event for this process, oldest first, a general host facility
   * reached uniformly by any realization that wants to read its own history (concept-spec
   * Part 2.1), which is what makes `Evidence(...)` (Phase 0 item 3) an ordinary Concept
   * instead of host code that knows its name. Empty when no `tracePath` was given.
   */
  readonly events: readonly StoredTraceEvent[];
  /**
   * These candidates, most active first, with spread from `sources` (memory-spec Part
   * 10.1, emergent-judgment-plan Part 3.3). How a realization ranks what it offers, the way
   * step 3 of Part 8.2 ranks the focused individuals.
   */
  rank(candidates: readonly string[], sources?: readonly string[]): string[];
  /** Remove these turns from the persisted trace, for explicit forgetting. */
  forgetTurns(saidSeqs: readonly number[]): void;
}

export class Runtime {
  readonly store: ConceptStore;
  readonly cells = new CellStore();
  readonly relations: Relations;
  readonly trace = new Trace();
  readonly maximumDepth: number;
  readonly maximumSteps: number;
  /** This host is a JavaScript one. A Rust host would say so and select its own bodies. */
  readonly speaks: readonly string[];
  /** Undefined when no `tracePath` was given: recency alone decides tier 3 (pre-Phase 1). */
  private readonly evidence: EvidenceStore | undefined;
  private readonly tracePath: string | undefined;
  private steps = 0;
  /** Ambient state a deictic realization reads instead of its arguments. */
  readonly context = new Map<string, string>();
  /** Incomparable context matches, surfaced rather than silently resolved. */
  readonly ambiguities: string[] = [];
  /**
   * Concepts entered through a synonym forward, innermost last.
   *
   * SynonymOf is symmetric, so a single assertion derives an arrow in both directions and
   * Hi forwards to Hello while Hello forwards to Hi. Each looks realized and neither can
   * do anything. Refusing to forward back to somewhere the call just came from makes the
   * pair harmless without having to find and delete every one of them.
   */
  private readonly forwarding: string[] = [];

  constructor(store = new ConceptStore(), options: RuntimeOptions = {}) {
    this.store = store;
    this.relations = new Relations(store);
    this.maximumDepth = options.maximumDepth ?? 64;
    this.maximumSteps = options.maximumSteps ?? 4000;
    this.speaks = options.speaks ?? ["JavaScript"];
    this.tracePath = options.tracePath;
    this.evidence = options.tracePath === undefined ? undefined : evidenceStoreFor(options.tracePath);
  }

  /** Where the current attempt starts in the trace. Earlier attempts are history. */
  private mark = 0;
  get attemptStart(): number {
    return this.mark;
  }

  reset(): void {
    this.steps = 0;
    this.ambiguities.length = 0;
    this.forwarding.length = 0;
    this.mark = this.trace.mark();
  }

  async evaluate(expression: Expr, context?: Expr): Promise<Expr> {
    return this.run(expression, context, "Entry", undefined, 0);
  }


  /** Calls whose arguments are values already, made by compiled code: not evaluated again. */
  private readonly given = new WeakSet<Call>();

  /**
   * A call that, to be evaluated, needs the identical call in the identical context is a
   * cycle, not a computation: a Teacher taught Wish to forward to Want where Want already
   * forwarded to Wish, and every "want" ran to the depth budget. The inner one stays
   * residual, which is the honest outcome, and the loop costs one step instead of sixty-four.
   *
   * What counts is the call's own ancestry, the calls it is being evaluated inside, not
   * everything running at the moment: two arguments evaluated side by side that ask the
   * same thing are not a cycle (chess asks both castling wings about the same board).
   */
  private async run(
    expression: Expr,
    context: Expr | undefined,
    caller: string,
    parent: string | undefined,
    depth: number,
    within?: Ancestry,
  ): Promise<Expr> {
    if (expression === null || typeof expression !== "object" || isVariable(expression)) {
      return this.step(expression, context, caller, parent, depth, within);
    }
    const key = `${format(expression)}@${context === undefined ? "" : format(context)}`;
    for (let a = within; a; a = a.up) if (a.key === key) return expression;
    return this.step(expression, context, caller, parent, depth, { key, up: within });
  }

  private async step(
    expression: Expr,
    context: Expr | undefined,
    caller: string,
    parent: string | undefined,
    depth: number,
    within?: Ancestry,
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

      const suppressed = suppressedProperties(context, (identity) =>
        claims({ relations: this.store.get(identity)?.relations ?? [] }),
      );

      // Tier 3: evidence in this context, falling back to recency where there is none
      // (Phase 1). `this.evidence` is undefined with no `tracePath`, so an unconfigured
      // runtime behaves exactly as it did before evidence existed.
      const preference = this.evidence
        ? (candidate: Candidate): number | undefined =>
            this.evidence!.score(realizationHash(realizationExpr(candidate.realization)), facets(context), this.store)
        : undefined;

      // A body this host cannot run is not a candidate. Selecting one and then failing
      // would let a Rust body shadow the JavaScript body beside it and take a working
      // Concept down with it -- the graph holds both on purpose.
      const found = candidates(this.store, target, context, suppressed, preference).filter((candidate) => {
        if (
          isCodeBody(candidate.realization.body) &&
          !this.speaks.includes(codeLanguage(candidate.realization.body))
        ) {
          return false;
        }
        // Never forward back to where the call just came from.
        const to = forwardTarget(candidate.realization);
        return to === undefined || !this.forwarding.includes(to);
      });
      if (incomparable(found)) {
        this.ambiguities.push(
          `${format(target)} matched ${found.length} equally specific realizations on different facets`,
        );
      }
      this.trace.selection(id, found.length, tieBreakDecided(found));
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

      if (realization.evaluateArguments && !this.given.has(target)) {
        args = await Promise.all(
          target.args.map(async (a) => {
            const value = await this.run(a.value, context, target.head, id, depth + 1, within);
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

      const forwardsTo = forwardTarget(realization);
      if (forwardsTo !== undefined) this.forwarding.push(target.head);

      let result: Expr;
      if (isCodeBody(realization.body)) {
        try {
          result = await this.runCode(realization, bindings, args, bodyContext, id, depth, within);
        } finally {
          if (forwardsTo !== undefined) this.forwarding.pop();
        }
      } else {
        // A body written in the code IR and declared Compile() runs as one function; one
        // that cannot be compiled is interpreted, as every composed body is.
        const compiled = declares(realization, "Compile") ? compiledFor(this.store, realization) : undefined;
        if (compiled) {
          result = await compiled(bindings, this.api(bodyContext, id, depth, within));
        } else {
          const body = substitute(realization.body, bindings);
          result = await this.run(body, bodyContext, target.head, id, depth + 1, within);
        }
      }

      if (realization.evaluateResult) {
        result = await this.run(result, bodyContext, target.head, id, depth + 1, within);
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
    within?: Ancestry,
  ): Promise<Expr> {
    const source = codeSource(realization.body);
    if (source === undefined) {
      throw new Error("A Code body needs a source string");
    }
    const language = codeLanguage(realization.body);
    if (!this.speaks.includes(language)) {
      // Not a failure of the Concept: the graph holds a correct implementation that this
      // host cannot run. Another host, reading the same graph, would pick a different one.
      throw new ConceptError(
        call("ForeignCode", [
          { name: "language", value: language },
          { name: "host", value: this.speaks.join(", ") },
        ]),
        `This host runs ${this.speaks.join(", ")} and the body is ${language}`,
      );
    }
    const api = this.api(context, parent, depth, within);
    // Built once per source, not once per call: every Code body went through new Function
    // on every evaluation.
    let fn = COMPILED_SOURCES.get(source);
    if (!fn) {
      fn = new Function("args", "bindings", "api", `return (${source})(args, bindings, api);`) as CodeFunction;
      COMPILED_SOURCES.set(source, fn);
    }
    return await fn(args, bindings, api);
  }

  /** What a body reaches the host through, whether it is JavaScript or compiled IR. */
  private api(context: Expr | undefined, parent: string, depth: number, within?: Ancestry): CodeApi {
    return {
      store: this.store,
      cells: this.cells,
      relations: this.relations,
      trace: this.trace,
      evaluate: (expression, ctx) =>
        this.run(expression, ctx ?? context, "Code", parent, depth + 1, within),
      apply: (head, values) => {
        const target = call(head, values.map((value) => ({ value })));
        this.given.add(target);
        return this.run(target, context, "Code", parent, depth + 1, within);
      },
      substitute,
      parse,
      ambient: (key) => this.context.get(key),
      context,
      format,
      call: (head, ...values) => call(head, values.map((value) => ({ value }))),
      events: this.evidence?.all() ?? [],
      rank: (candidates, sources = []) =>
        activation(this.store, sources, { among: candidates, events: this.evidence?.all() ?? [] }).map((a) => a.identity),
      forgetTurns: (saidSeqs) => {
        if (this.tracePath === undefined || !saidSeqs.length) return;
        dropTurns(this.tracePath, new Set(saidSeqs));
        resetEvidenceCache(this.tracePath);
      },
    };
  }
}

/** The calls a call is being evaluated inside, innermost first. */
interface Ancestry {
  readonly key: string;
  readonly up?: Ancestry;
}

type CodeFunction = (a: readonly Argument[], b: Bindings, c: CodeApi) => Expr | Promise<Expr>;
const COMPILED_SOURCES = new Map<string, CodeFunction>();

export { ConceptError };
