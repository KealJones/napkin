/**
 * One turn: a message becomes Concepts, the Concepts are realized, and whatever could not
 * be realized is collected as the work queue.
 *
 * Gaps are found by walking the realized result, not by reading a top-level wrapper
 * (concept-spec Part 8.2). A parallel list of gaps alongside the tree would be duplicate
 * state that can disagree with it.
 */
import { type Call, type Expr, c, call, equal, format, isCall, parse, walk } from "../concept/expression.js";
import { ANON } from "../concept/match.js";
import { hear, type EarsResult, type HearOptions } from "../ears/ears.js";
import { say } from "../ears/say.js";
import { learn, type LearnStep } from "../learn/learn.js";
import { resolveReferences } from "./references.js";
import { forSaying } from "./individuals.js";
import { answerToConflict, answerToWhich, resolveNames, resolvePronouns, whichOf, type NameResolution } from "./individuals.js";
import { ConceptError } from "./errors.js";
import type { Runtime } from "./evaluator.js";
import { lineage, reachesBehaviour } from "./select.js";
import { facets } from "./context.js";
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
  /** The reading, as an expression, which is what memory records (memory-spec Part 5.2). */
  readonly expression: Expr | undefined;
  readonly parsed: string | undefined;
  /** References the parser marked, and what memory resolved them to. */
  readonly resolved: { reference: string; to: string }[];
  /** Proper-name heads resolved to the individual holding that `Named` (memory-spec Part 8.3). */
  readonly resolvedNames: NameResolution[];
  readonly result: Expr | undefined;
  readonly rendered: string;
  /** The result as a sentence. The graph decides the answer; this only says it. */
  readonly spoken: string;
  readonly gaps: Gap[];
  readonly ambiguities: string[];
  readonly learned: LearnStep[];
  /** How many times the message was read again after learning (ir-spec Part 8.3). */
  readonly rereads: number;
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

/**
 * Does the answer still contain something that never ran?
 *
 * This is a different question from "is anything learnable", and confusing the two let the
 * model answer from its own knowledge. "which is bigger, a mouse or an elephant" produced
 * `Answer(GreaterThan(Size(Ref("a mouse")), Size(Ref("an elephant"))))` -- nothing
 * evaluated. The Ref was unresolved, so Size was residual because its argument was, and
 * GreaterThan because ITS argument was; innermost-only attribution correctly collapsed all
 * of that to the Ref, and a Ref is a Marker and so not learnable. Nothing was learnable,
 * the Mouth concluded it had an answer, and the model wrote "An elephant is bigger than a
 * mouse" out of its own head.
 *
 * It was right, which is what makes it dangerous: a system that sometimes answers from the
 * graph and sometimes from the model, with no way to tell which, is not a graph-backed
 * system at all.
 */
export function holdsResidual(runtime: Runtime, result: Expr | undefined): boolean {
  if (result === undefined) return false;
  // Describing is an answer ABOUT something residual, and works precisely because the
  // subject does not evaluate: `What(Promise())` finds no realization, goes residual, and
  // is described (concept-spec Part 4.0). Counting that as uncomputed rejected the best
  // answer the system gives.
  if (isCall(result) && result.head === "Describes") return false;
  const unevaluated = runtime.trace.residuals(runtime.attemptStart).map((e) => e.input);
  if (!unevaluated.length) return false;
  for (const node of walk(result)) {
    if (isCall(result) && result.head === "Answer" && node === result) continue;
    if (unevaluated.some((r) => equal(r, node))) return true;
  }
  return false;
}

/** Everything the graph could not realize, plus every unresolved reference. */
export function collectGaps(runtime: Runtime, result: Expr | undefined): Gap[] {
  const gaps = new Map<string, Gap>();

  // Only this attempt. A residual the learning loop has since closed is not a gap.
  const residuals = runtime.trace.residuals(runtime.attemptStart);
  const inputs = residuals.map((e) => e.input);
  for (const event of residuals) {
    if (explainedByAnother(event.input, inputs)) continue;
    // A name resolved to an individual is a thing, not missing behaviour: "who is greg"
    // describes Greg_1 whether or not a kind called Greg exists.
    if (isCall(event.input) && event.input.args.some((a) => a.name === "resolvedTo")) continue;
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
/**
 * Things a Concept can be that make describing it the right answer rather than teaching it.
 *
 * `Result` is the load-bearing one and was missing: Answer, Describes, NoDescription and
 * Saved are what the system PRODUCES. They take arguments and realize nothing, which is
 * exactly the shape of missing behaviour, so the loop sent `Describes` to the Teacher --
 * and a realization for it would make the wrapper evaluate away and destroy the answer it
 * was carrying.
 */
const ENTITY = new Set([
  "Category", "Marker", "Data", "Primitive", "Collection", "Deictic", "Result",
  // Modifier and Frame are structure too. "dont tell me the time" answered "I do not know
  // how to Not", because Not takes an argument, realizes nothing, and so looks exactly
  // like missing behaviour. A modifier is meant to survive into the answer, not run.
  "Modifier", "Frame", "Politeness", "RelationProperty", "RealizationProperty",
]);

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
  /**
   * Close gaps by learning before answering (concept-spec Part 12). On by default, and the
   * default belongs here rather than in each caller: the CLI had it off and the studio had
   * it on, so the same question answered differently depending on where it was asked.
   */
  learn?: boolean;
  /** Render the result as a sentence. */
  speak?: boolean;
  maxPasses?: number;
  research?: boolean;
  /** Off runs the loop on the graph alone, with no model asked to teach anything. */
  teacher?: boolean;
  /**
   * The conversation this message is said in, as ambient state, so what it is focused on
   * can be derived for it (memory-spec Part 8.1). Absent, nothing is focused.
   */
  conversation?: string;
}

/**
 * Facets the message itself named.
 *
 * The context was hardcoded to `Execution()` on every turn, so "write me a typescript
 * function" parsed to `Write(Function(TypeScript(), ...))` and the TypeScript sat there as
 * an ARGUMENT — present in the expression and structurally invisible to selection, which
 * only reads the context. The emission realizations built for `--as TypeScript` were
 * unreachable from a chat for exactly that reason.
 *
 * A facet is any nullary Concept whose lineage reaches `ContextFacet`, so the graph decides
 * what counts as one and this needs no list to maintain. Naming one in the message puts it
 * in the context, which is how a request to write TypeScript becomes an evaluation under
 * TypeScript.
 *
 * The facet is LIFTED, not copied. Leaving it in place says something false about the
 * shape: `Function(TypeScript(), Says("hello world"))` claims a function takes a language
 * as a parameter, and a realization taught for `Function($name, $params, $body)` can never
 * match it. Nothing is lost — the facet moves to where it means something, and the trace
 * records the context it moved to.
 */
export function facetsNamed(runtime: Runtime, expression: Expr): Expr[] {
  const found = new Map<string, Expr>();
  // A line's mood is scoped by Mood itself, to that line; lifting it would leave Mood with
  // nothing to scope and put one line's mood on every line.
  const scoped = new Set<Expr>();
  for (const node of walk(expression)) if (isCall(node) && node.head === "Mood" && node.args[0]) scoped.add(node.args[0].value);
  for (const node of walk(expression)) {
    if (!isCall(node) || node.args.length > 0 || scoped.has(node)) continue;
    if (node.head === "Context") continue;
    if (lineage(runtime.store, node.head).some((u) => u.identity === "ContextFacet")) {
      found.set(node.head, c(node.head));
    }
  }
  return [...found.values()];
}

/** Drop the facets that have moved into the context, so the shape says what it means. */
function withoutFacets(runtime: Runtime, e: Expr): Expr {
  if (!isCall(e)) return e;
  const kept = e.args.filter((a, i) => {
    if (e.head === "Mood" && i === 0) return true;
    const v = a.value;
    return !(
      isCall(v) &&
      v.args.length === 0 &&
      v.head !== "Context" &&
      lineage(runtime.store, v.head).some((u) => u.identity === "ContextFacet")
    );
  });
  return call(
    e.head,
    kept.map((a) =>
      a.name === undefined
        ? { value: withoutFacets(runtime, a.value) }
        : { name: a.name, value: withoutFacets(runtime, a.value) },
    ),
  );
}

/**
 * The caller's context widened by what the message asked for, and the expression with
 * those facets lifted out of it.
 */
function lift(runtime: Runtime, expression: Expr, given: Expr): { expression: Expr; context: Expr } {
  const named = facetsNamed(runtime, expression);
  if (!named.length) return { expression, context: given };
  const already = facets(given);
  const extra = named.filter((f) => !already.some((a) => equal(a, f)));
  const lifted = withoutFacets(runtime, expression);
  if (!extra.length) return { expression: lifted, context: given };
  // One facet is written plainly; two or more are wrapped (seed-concepts Part 4).
  return {
    expression: lifted,
    context: call("Context", [...already, ...extra].map((value) => ({ value }))),
  };
}

export async function turn(
  runtime: Runtime,
  message: string,
  given: Expr,
  options: TurnOptions = {},
): Promise<TurnResult> {
  runtime.reset();
  // "the coworker one", answering "which Greg do you mean": the words asked about are read
  // again, with the name taken to mean the one picked.
  const answering = answerToWhich(options.history?.[options.history.length - 1]?.result, message, parse);
  const chosen = new Map(answering ? [[answering.name, answering.chosen]] : []);
  if (answering) message = answering.said;
  // "yes, she moved", answering "has that changed?": the words are read again, replacing.
  const changed = answerToConflict(options.history?.[options.history.length - 1]?.result, message, parse);
  if (changed) {
    message = changed;
    runtime.context.set("replace", "1");
  } else runtime.context.delete("replace");
  // Deixis reads ambient state: Self() needs to know which message it is inside.
  runtime.context.set("message", message);
  if (options.conversation === undefined) runtime.context.delete("conversation");
  else runtime.context.set("conversation", options.conversation);
  // The rules read first and the model only what they cannot, here rather than in each
  // caller, so the CLI and the studio hear a message the same way.
  options = { backend: "hybrid", ...options };
  let heard = await hear(runtime.store, message, options);
  if (!heard.expression) {
    return {
      heard,
      expression: undefined,
      parsed: undefined,
      resolved: [],
      resolvedNames: [],
      result: undefined,
      rendered: "(nothing parsed)",
      spoken: "I could not read that as Concepts.",
      gaps: [],
      ambiguities: [],
      learned: [],
      rereads: 0,
      failed: heard.problems.join("; "),
    };
  }

  // A Ref marks a reference the parser could not resolve; a proper name is just a bare
  // head. Both are memory's job to resolve, once, here, before the parse becomes a Said
  // (memory-spec Part 8.3).
  const read = (
    h: EarsResult,
  ): { expression: Expr; resolved: { reference: string; to: string }[]; resolvedNames: NameResolution[] } => {
    // A pronoun for a person first, so "him" is not taken for the last answer.
    const pointed = h.expression === undefined ? undefined : resolvePronouns(runtime.store, h.expression);
    const { expression: maybe, resolved } = resolveReferences(pointed, options.history ?? []);
    const { expression: named, resolved: resolvedNames } = resolveNames(
      runtime.store,
      maybe ?? h.expression!,
      runtime.ambiguities,
      chosen,
    );
    return { expression: named, resolved, resolvedNames };
  };
  let { expression, resolved, resolvedNames } = read(heard);
  // Evaluate under what the message asked for, not only under what the caller assumed.
  // `expression` is what was said and is what gets reported; `running` is what evaluates,
  // with any context facet lifted out of it.
  let lifted = lift(runtime, expression, given);
  let running = lifted.expression;
  let context = lifted.context;

  let result: Expr | undefined;
  let failed: string | undefined;
  let learned: LearnStep[] = [];
  let rereads = 0;

  // A name that could be either of two people is asked about, never guessed.
  const which = whichOf(runtime.store, expression, message);
  if (which) {
    result = which;
  } else if (options.learn !== false) {
    /**
     * Resolution is a loop, not one shot (`ir-spec.md` Part 8.3).
     *
     * The first parse of a message full of unfamiliar vocabulary is necessarily the worst
     * parse that will ever be produced, because it was made with the least knowledge.
     * Committing to it is the mistake. So after learning has changed the graph, the
     * ORIGINAL message is read again — the parser now has a different graph to parse
     * against, and the second reading is made with more than the first.
     *
     * It stops when a pass learns nothing, when the reading stops changing, or at the
     * bound. A reading that does not change is the loop's fixed point and re-running it
     * would only cost another model call.
     */
    const maxReads = options.maxPasses ?? 3;
    /**
     * Carried ACROSS readings, not rebuilt for each one.
     *
     * learn() keeps a set of identities already put to the Teacher so a turn cannot ask
     * the same question twice. The re-parse loop calls learn() again per reading, and a
     * fresh set each time undid that: one message taught Write three times, Function
     * twice, and researched each of them again first.
     */
    const asked = new Set<string>();
    for (;;) {
      const outcome = await learn(runtime, message, running, context, { ...options, asked });
      result = outcome.result;
      learned = [...learned, ...outcome.steps];
      if (!outcome.steps.length || rereads + 1 >= maxReads) break;

      const again = await hear(runtime.store, message, options);
      if (!again.expression) break;
      rereads += 1;
      const next = read(again);
      if (equal(next.expression, expression)) break;
      heard = again;
      expression = next.expression;
      resolved = next.resolved;
      resolvedNames = next.resolvedNames;
      lifted = lift(runtime, expression, given);
      running = lifted.expression;
      context = lifted.context;
    }
  } else {
    try {
      result = await runtime.evaluate(running, context);
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
  // An answer still carrying something that never ran is not an answer, whether or not
  // anything about it is learnable. Handing it to the model invites an answer from the
  // model, which is the one thing this system exists not to do.
  const uncomputed = holdsResidual(runtime, result);
  const spoken =
    options.speak === false || !result
      ? rendered
      : await say(message, forSaying(runtime.store, result), { ...options, unrealized, uncomputed, asked: expression });

  return {
    heard,
    expression,
    parsed: format(expression),
    resolved,
    resolvedNames,
    result,
    rendered,
    spoken,
    gaps,
    ambiguities: [...runtime.ambiguities],
    learned,
    rereads,
    failed,
  };
}
