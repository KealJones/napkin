/**
 * One turn: a message becomes Concepts, the Concepts are realized, and whatever could not
 * be realized is collected as the work queue.
 *
 * Gaps are found by walking the realized result, not by reading a top-level wrapper
 * (concept-spec Part 8.2). A parallel list of gaps alongside the tree would be duplicate
 * state that can disagree with it.
 */
import { type Call, type Expr, equal, format, isCall, walk } from "../concept/expression.js";
import { ANON } from "../concept/match.js";
import { hear, type EarsResult, type HearOptions } from "../ears/ears.js";
import { say } from "../ears/say.js";
import { learn, type LearnStep } from "../learn/learn.js";
import { resolveReferences } from "./references.js";
import { ConceptError } from "./errors.js";
import type { Runtime } from "./evaluator.js";
import { lineage, reachesBehaviour } from "./select.js";
import { Relations } from "../store/relations.js";

export interface Gap {
  /**
   * `unknown`   — the identity is not in the graph at all. This is the learning target.
   * `inert`     — the identity exists and simply has no applicable realization here.
   *               Normal and not a gap: markers, relations and pure data behave this way.
   * `reference` — an unresolved Ref, needing history rather than teaching.
   */
  readonly kind: "unknown" | "inert" | "reference";
  readonly identity: string;
  readonly expression: string;
  /** The call itself, so a gap can be judged structurally rather than by its text. */
  readonly input: Expr;
}

export interface TurnResult {
  readonly heard: EarsResult;
  readonly parsed: string | undefined;
  /** References the parser marked, and what memory resolved them to. */
  readonly resolved: { reference: string; to: string }[];
  readonly result: Expr | undefined;
  readonly rendered: string;
  /** The result as a sentence. The graph decides the answer; this only says it. */
  readonly spoken: string;
  readonly gaps: Gap[];
  readonly ambiguities: string[];
  readonly learned: LearnStep[];
  readonly failed?: string;
}

/**
 * A residual whose own argument is residual is not a gap in its own right — it is the
 * downstream shadow of one. `Add("10:15", 5)` went residual because a string is not a
 * number, and `Time(Add(...))` then went residual because its argument had. Reporting both
 * sent the Teacher after `Add` and `Time`, neither of which was broken, and it taught them
 * nonsense. Only the innermost residual is the thing that actually could not be worked out.
 */
function explainedByAnother(input: Expr, all: readonly Expr[]): boolean {
  return all.some((other) => {
    if (other === input || equal(other, input)) return false;
    for (const node of walk(input)) {
      if (node !== input && equal(node, other)) return true;
    }
    return false;
  });
}

/** Everything the graph could not realize, plus every unresolved reference. */
export function collectGaps(runtime: Runtime, result: Expr | undefined): Gap[] {
  const gaps = new Map<string, Gap>();

  // Only this attempt. A residual the learning loop has since closed is not a gap.
  const residuals = runtime.trace.residuals(runtime.attemptStart);
  const inputs = residuals.map((e) => e.input);
  for (const event of residuals) {
    if (explainedByAnother(event.input, inputs)) continue;
    // A residual is not automatically a gap. A Concept that exists and simply does not
    // realize here is behaving correctly — that is how markers, relations and pure data
    // work. Only an identity the graph has never heard of is something to learn.
    gaps.set(event.concept, {
      kind: runtime.store.has(event.concept) ? "inert" : "unknown",
      identity: event.concept,
      expression: format(event.input),
      input: event.input,
    });
  }
  const markReferences = (e: Expr): void => {
    if (!isCall(e)) return;
    if (e.head === "Ref") {
      gaps.set(`Ref:${format(e)}`, {
        kind: "reference",
        identity: "Ref",
        expression: format(e),
        input: e,
      });
    }
    for (const a of e.args) markReferences(a.value);
  };
  if (result) markReferences(result);
  return [...gaps.values()];
}

/**
 * A record rather than a request. `Time(hour=10, minute=36, spoken="10:36 AM")` is the
 * VALUE a realization produced; every argument is named and every value is a primitive, so
 * there is nothing to compute and nothing missing. Re-evaluating one leaves it residual,
 * which is correct — but it was being read as missing behaviour, and the Teacher duly
 * taught Time to turn itself into a Timestamp and destroyed the value.
 */
/** Does this contain `$_`, the anonymous unknown? */
export function holdsAnUnknown(e: Expr): boolean {
  for (const node of walk(e)) {
    if (typeof node === "object" && node !== null && "variable" in node && node.variable === ANON) {
      return true;
    }
  }
  return false;
}

export function isConstructedData(e: Expr): boolean {
  if (!isCall(e) || !e.args.length) return false;
  return e.args.every((a) => a.name !== undefined && !isCall(a.value) && !("variable" in Object(a.value)));
}

/**
 * A call that asked for something and got itself back. Pure data is supposed to be inert —
 * a marker, a relation, a category, a record — so only a call that wanted work done, on a
 * Concept that already realizes something, counts as missing behaviour.
 */
/**
 * A Marker stays residual on purpose. Ref, Aside and Fuzzy are supposed to remain visible
 * until something resolves them, so an unrealized one is the design working, not a gap.
 * Read as missing behaviour, `Ref("the math")` had a Teacher hand it
 * `Ref($text) := Ref($text, resolvedTo=Ref($text))`, which recursed until the depth budget
 * stopped it — and that realization had already been saved.
 */
/** Things a Concept can be that make describing it the right answer. */
const ENTITY = new Set(["Category", "Marker", "Data", "Primitive", "Collection", "Deictic"]);

export function isMarker(runtime: Runtime, identity: string): boolean {
  return lineage(runtime.store, identity).some((u) => u.identity === "Marker");
}

export function wantsBehaviour(runtime: Runtime, gap: Gap): boolean {
  if (isMarker(runtime, gap.identity)) return false;
  if (!isCall(gap.input) || !gap.input.args.length) return false;
  if (isConstructedData(gap.input)) return false;
  // An anonymous unknown in the call means the INPUTS are missing, not the behaviour.
  // Multiply knows perfectly well how to multiply; nobody said what to multiply.
  if (holdsAnUnknown(gap.input)) return false;
  const unit = runtime.store.get(gap.identity);
  if (!unit) return false;
  // A category or an entity is a thing, not a doing: describing it IS the answer, and
  // teaching Chess a realization would be nonsense.
  const describesOnly = unit.relations.some(
    ({ claim: r }) =>
      isCall(r) && r.head === "IsA" && isCall(r.args[0]?.value) && ENTITY.has((r.args[0].value as Call).head),
  );
  if (describesOnly) return false;
  // Realizing something already means this is a shape it cannot handle. Realizing NOTHING,
  // for a call that asked for work, means it cannot handle any shape — which is the same
  // gap and a worse one. Requiring existing behaviour here let a Concept the Teacher had
  // just created with relations alone fall straight through to being described.
  return true;
}

/** Known, but reaching nothing realizable: an orphan, which attaching can fix. */
export function isOrphan(runtime: Runtime, identity: string): boolean {
  if (!runtime.store.has(identity)) return false;
  if (reachesBehaviour(runtime.store, identity)) return false;
  return new Relations(runtime.store)
    .cluster(identity, 24, true)
    .some((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
}

/**
 * Three things are learnable, not one:
 *   unknown  — the graph has never heard of it, so teach the Concept;
 *   orphan   — it knows it but reaches nothing, so attach it;
 *   inert    — it exists and has no realization for THIS call, so teach the behaviour.
 *
 * The same test decides what to learn and what counts as unanswered, because a gap the
 * loop would try to close is exactly a gap that means the result is not yet an answer.
 */
export function learnable(runtime: Runtime, gaps: readonly Gap[]): Gap[] {
  return gaps.filter(
    (g) =>
      g.kind === "unknown" ||
      (g.kind === "inert" && (isOrphan(runtime, g.identity) || wantsBehaviour(runtime, g))),
  );
}

export interface TurnOptions extends HearOptions {
  /** Close gaps by learning before answering (concept-spec Part 12). */
  learn?: boolean;
  /** Render the result as a sentence. */
  speak?: boolean;
  maxPasses?: number;
  research?: boolean;
}

export async function turn(
  runtime: Runtime,
  message: string,
  context: Expr,
  options: TurnOptions = {},
): Promise<TurnResult> {
  runtime.reset();
  // Deixis reads ambient state: Self() needs to know which message it is inside.
  runtime.context.set("message", message);
  const heard = await hear(runtime.store, message, options);
  if (!heard.expression) {
    return {
      heard,
      parsed: undefined,
      resolved: [],
      result: undefined,
      rendered: "(nothing parsed)",
      spoken: "I could not read that as Concepts.",
      gaps: [],
      ambiguities: [],
      learned: [],
      failed: heard.problems.join("; "),
    };
  }

  // A Ref marks a reference the parser could not resolve. Resolving it is memory's job.
  const { expression: maybe, resolved } = resolveReferences(heard.expression, options.history ?? []);
  const expression = maybe ?? heard.expression;

  let result: Expr | undefined;
  let failed: string | undefined;
  let learned: LearnStep[] = [];

  if (options.learn) {
    const outcome = await learn(runtime, message, expression, context, options);
    result = outcome.result;
    learned = outcome.steps;
  } else {
    try {
      result = await runtime.evaluate(expression, context);
    } catch (caught) {
      failed = caught instanceof ConceptError ? format(caught.value) : String(caught);
    }
  }

  const rendered = result ? format(result) : (failed ?? "(no result)");
  const gaps = collectGaps(runtime, result);
  // Anything still learnable after learning has run means the result is not an answer.
  // Restricting this to `unknown` let the Mouth narrate a residual it had not computed:
  // ShiftHours(Timestamp(...), 5) came back as "the time becomes three thirty-six PM",
  // which is the model doing arithmetic the graph refused to do.
  const unrealized = learnable(runtime, gaps).map((g) => ({ identity: g.identity, kind: g.kind }));
  const spoken =
    options.speak === false || !result
      ? rendered
      : await say(message, result, { ...options, unrealized, asked: expression });

  return {
    heard,
    parsed: format(expression),
    resolved,
    result,
    rendered,
    spoken,
    gaps,
    ambiguities: [...runtime.ambiguities],
    learned,
    failed,
  };
}
