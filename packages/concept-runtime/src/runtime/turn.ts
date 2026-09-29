/**
 * One turn: a message becomes Concepts, the Concepts are realized, and whatever could not
 * be realized is collected as the work queue.
 *
 * Gaps are found by walking the realized result, not by reading a top-level wrapper
 * (concept-spec Part 8.2). A parallel list of gaps alongside the tree would be duplicate
 * state that can disagree with it.
 */
import { type Call, type Expr, c, call, equal, format, isCall, parse, walk } from "../concept/expression.js";
import { typesOf } from "./types.js";
import { ANON } from "../concept/match.js";
import { hear, type EarsResult, type HearOptions } from "../ears/ears.js";
import type { ConceptStore } from "../store/store.js";
import { say } from "../ears/say.js";
import { foldPhrases } from "../ears/phrase.js";
import { learn, unknownAnswer, type LearnStep } from "../learn/learn.js";
import { resolveReferences } from "./references.js";
import { forSaying } from "./individuals.js";
import { answerToConflict, answerToWhich, pickSense, resolveNames, resolvePronouns, whichOf, type NameResolution } from "./individuals.js";
import { ConceptError } from "./errors.js";
import { Runtime } from "./evaluator.js";
import { facetAncestors, lineage, reachesBehaviour } from "./select.js";
import { facets } from "./context.js";
import { Relations } from "../store/relations.js";
import { groundInWikidata, reachesInWikidata, regroundSense, wikidataItem } from "../research/wikidata.js";

export interface Gap {
  /**
   * `unknown`   — the identity is not in the graph at all. This is the learning target.
   * `inert`     — the identity exists and simply has no applicable realization here.
   *               Normal and not a gap: markers, relations and pure data behave this way.
   * `reference` — an unresolved Ref, needing history rather than teaching.
   * `empty`     — the identity exists and holds nothing saying what it is, only that it is
   *               a kind of thing. Asked about, it is looked up like an unknown.
   */
  readonly kind: "unknown" | "inert" | "reference" | "empty";
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
  /** Who worded it: the graph (packs/english.ncon), or the host's plain wordings. */
  readonly spokenBy: "graph" | "plain" | "none";
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
  // What a named argument holds is data about its call (a SourceCode's ir= is code, not steps
  // left undone): only the answer's own parts are walked.
  const parts = (e: Expr): Expr[] => [e, ...(isCall(e) ? e.args.filter((a) => a.name === undefined).flatMap((a) => parts(a.value)) : [])];
  for (const node of parts(result)) {
    if (isCall(result) && result.head === "Answer" && node === result) continue;
    // Inert data is the answer's structure. Keep walking its children: a data wrapper
    // must never hide an unresolved computation or reference inside it.
    if (isCall(node) && isPureData(runtime, node.head)) continue;
    // A marker is meant to survive into the answer as said ("haha" set aside), not run, and
    // so is a word for someone in the conversation: "me" in a statement is the speaker.
    if (isCall(node) && (isMarker(runtime, node.head) || lineage(runtime.store, node.head).some((u) => u.identity === "Deictic"))) continue;
    // A thing named, with nothing to do (Clock() in what clock means): being itself is all it
    // does, so it is not work left undone. What is not known of it is a gap, reported apart.
    if (isCall(node) && !node.args.length && !reachesBehaviour(runtime.store, node.head)) continue;
    if (unevaluated.some((r) => equal(r, node))) return true;
  }
  return false;
}

function isPureData(runtime: Runtime, identity: string): boolean {
  return !reachesBehaviour(runtime.store, identity) &&
    lineage(runtime.store, identity).some((u) => u.identity === "Data" || u.identity === "Result");
}

const holds = (e: Expr, part: Expr): boolean => equal(e, part) || (isCall(e) && e.args.some((a) => a.name === undefined && holds(a.value, part)));

/** Everything the graph could not realize, plus every unresolved reference. */
export function collectGaps(runtime: Runtime, result: Expr | undefined): Gap[] {
  const gaps = new Map<string, Gap>();

  // Only this attempt. A residual the learning loop has since closed is not a gap.
  const residuals = runtime.trace.residuals(runtime.attemptStart);
  const inputs = residuals.map((e) => e.input);
  for (const event of residuals) {
    if (explainedByAnother(event.input, inputs)) continue;
    // A residual that was worked around is not missing: "what is my name" left My(Name())
    // residual and then found the name some other way. Only what the answer still holds, or
    // a turn with no answer at all, has something left to learn.
    // What a named argument holds is data about its call (a SourceCode's ir= is code, not steps
    // left undone), so only what the answer holds as its own parts counts.
    if (result !== undefined && !holds(result, event.input)) continue;
    // A name resolved to an individual is a thing, not missing behaviour: "who is greg"
    // describes Greg_1 whether or not a kind called Greg exists.
    if (isCall(event.input) && event.input.args.some((a) => a.name === "resolvedTo")) continue;
    // A value is the answer's structure, not something missing: Answer(True()) holds True.
    if (isCall(event.input) && isPureData(runtime, event.input.head)) continue;
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
  // "what is a work in progress": described, and all there is to say is that it is a kind.
  if (result !== undefined && isCall(result) && result.head === "Describes") {
    const about = result.args[0]?.value;
    if (isCall(about) && !about.args.length && meaningless(runtime, about.head)) {
      gaps.set(about.head, { kind: "empty", identity: about.head, expression: format(about), input: about });
    }
  }
  return [...gaps.values()];
}

/**
 * A Concept put in a relation and never taught holds its category and nothing else:
 * `WorkInProgress IsA(Category())`. Nothing says what it is, so it is still to be learned.
 */
export function meaningless(runtime: Runtime, identity: string): boolean {
  const unit = runtime.store.get(identity);
  if (!unit || reachesBehaviour(runtime.store, identity)) return false;
  return unit.relations.every((r) => isCall(r.claim) && r.claim.head === "IsA" && format(r.claim) === "IsA(Category())");
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
  if (isPureData(runtime, gap.identity)) return false;
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
      g.kind === "empty" ||
      (g.kind === "inert" && (isOrphan(runtime, g.identity) || wantsBehaviour(runtime, g))),
  );
}

export interface TurnOptions extends HearOptions {
  /** Parse exact Concept syntax directly when explicitly requested. */
  inputMode?: "message" | "expression";
  /**
   * Close gaps by learning before answering (concept-spec Part 12). On by default, and the
   * default belongs here rather than in each caller: the CLI had it off and the studio had
   * it on, so the same question answered differently depending on where it was asked.
   */
  learn?: boolean;
  /** Render the result as a sentence. */
  speak?: boolean;
  maxPasses?: number;
  /** Off keeps learning to the graph: no Wikidata, no dictionary. */
  research?: boolean;
  /**
   * The conversation this message is said in, as ambient state, so what it is focused on
   * can be derived for it (memory-spec Part 8.1). Absent, nothing is focused.
   */
  conversation?: string;
}

/**
 * Each pointing word not yet resolved, resolved by the graph (`ReferentOf`, packs/focus.ncon) in
 * an attempt of its own, so looking does not leave gaps in the turn. Unchanged where it finds
 * nothing.
 */
async function pointAt(runtime: Runtime, expression: Expr): Promise<Expr> {
  if (!runtime.store.has("ReferentOf") || runtime.context.get("conversation") === undefined) return expression;
  const hook = new Runtime(runtime.store, { maximumDepth: runtime.maximumDepth, maximumSteps: runtime.maximumSteps, traceQuiet: true });
  for (const [key, value] of runtime.context) hook.context.set(key, value);
  const walk = async (e: Expr): Promise<Expr> => {
    if (!isCall(e)) return e;
    if (e.head === "Ref" && e.args.length === 1 && typeof e.args[0].value === "string") {
      const to = await hook.evaluate(call("ReferentOf", [{ value: e.args[0].value }]), c("Execution"));
      return isCall(to) && to.head !== "ReferentOf" && !to.args.length ? call("Ref", [e.args[0], { name: "resolvedTo", value: to }]) : e;
    }
    // A pointing word that holds what it points to the owner of ("his wife" is His(Wife())): whose.
    if (e.args.length === 1 && e.args[0].name === undefined && isCall(e.args[0].value)) {
      const to = await hook.evaluate(call("ReferentOf", [{ value: e.head.toLowerCase() }]), c("Execution"));
      if (isCall(to) && to.head !== "ReferentOf" && !to.args.length) return call(e.head, [{ value: await walk(e.args[0].value) }, { name: "resolvedTo", value: to }]);
    }
    const args = [];
    for (const a of e.args) args.push({ ...a, value: await walk(a.value) });
    return { head: e.head, args };
  };
  return walk(expression);
}

/** Optional graph hooks use their own attempt so their residuals never become user gaps. */
async function graphText(runtime: Runtime, identity: string, input: Expr): Promise<string | undefined> {
  if (!runtime.store.has(identity)) return undefined;
  const hook = new Runtime(runtime.store, {
    maximumDepth: runtime.maximumDepth,
    maximumSteps: runtime.maximumSteps,
    speaks: runtime.speaks,
    traceQuiet: runtime.traceQuiet,
  });
  for (const [key, value] of runtime.context) hook.context.set(key, value);
  const result = await hook.evaluate(c(identity, input), c("Execution"));
  return typeof result === "string" ? result : undefined;
}

function exactExpression(message: string): EarsResult {
  try {
    return { message, raw: message, expression: parse(message), problems: [], rejected: [] };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { message, raw: message, expression: undefined, problems: [reason], rejected: [{ line: message, reason }] };
  }
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
  for (const node of walk(expression)) if (isCall(node) && (node.head === "Mood" || node.head === "ContextScope") && node.args[0]) scoped.add(node.args[0].value);
  // Things named side by side are peers, not a setting: "python or javascript" offers Python
  // as one of two options, where "in python" asks for it as the language to work in.
  for (const node of walk(expression)) {
    if (!isCall(node)) continue;
    const bare = node.args.filter((a) => a.name === undefined && isCall(a.value) && a.value.args.length === 0);
    if (bare.length >= 2) for (const a of bare) scoped.add(a.value);
    // What a named argument holds is data about its call, not a setting: the language of code
    // shown (InlineCode(..., language=TypeScript())) is the code's, not the conversation's.
    for (const a of node.args) if (a.name !== undefined && isCall(a.value)) scoped.add(a.value);
  }
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
  const peers = e.args.filter((a) => a.name === undefined && isCall(a.value) && a.value.args.length === 0).length >= 2;
  const kept = e.args.filter((a, i) => {
    if ((e.head === "Mood" || e.head === "ContextScope") && i === 0) return true;
    if (peers || a.name !== undefined) return true;
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
 * Each line with the facets named in it (a language: "in python", "to javascript") as its own
 * scope, written where it was said: ContextScope(Python(), line), the facet out of the phrase it
 * was said in (a function does not take a language as a parameter) but not out of sight. What
 * runs is what is shown, and one line's setting is not every line's. A facet brings what it is
 * a superset of: JavaScript is TypeScript as well.
 */
function lift(runtime: Runtime, expression: Expr, given: Expr): { expression: Expr; context: Expr } {
  const scope = (line: Expr): Expr => {
    const said = facetsNamed(runtime, line);
    if (!said.length) return line;
    const named = [...said, ...said.flatMap((f) => (isCall(f) ? facetAncestors(runtime.store, f.head).map((h) => c(h)) : []))];
    const already = facets(given);
    let body = withoutFacets(runtime, line);
    for (const f of named.filter((x, i) => !already.some((a) => equal(a, x)) && named.findIndex((y) => equal(x, y)) === i).reverse()) body = call("ContextScope", [{ value: f }, { value: body }]);
    return body;
  };
  const scoped = isCall(expression) && expression.head === "Sequence" ? call("Sequence", expression.args.map((a) => ({ ...a, value: scope(a.value) }))) : scope(expression);
  return { expression: scoped, context: given };
}

/**
 * Which of the senses asked about ("which platypus: the taxon or the musical group?") is the
 * kind a reply names ("the animal?"): the one whose Wikidata item reaches the kind's item in the
 * world's hierarchy, when only one does.
 */
async function pickByKind(store: ConceptStore, asked: string, kind: string, said: string, parse: (s: string) => Expr): Promise<{ name: string; chosen: string; said: string; sense: boolean } | undefined> {
  let which: Expr;
  try {
    which = parse(asked);
  } catch {
    return undefined;
  }
  if (!isCall(which) || !which.args.some((a) => a.name === "sense")) return undefined;
  const about = which.args[0]?.value;
  const options = which.args[1]?.value;
  const was = which.args.find((a) => a.name === "said")?.value;
  if (!isCall(about) || !isCall(options) || typeof was !== "string") return undefined;
  let target = wikidataItem(store, kind);
  if (!target) {
    await groundInWikidata(store, kind, { said }).catch(() => undefined);
    target = wikidataItem(store, kind);
  }
  if (!target) return undefined;
  const fits: string[] = [];
  for (const { value: option } of options.args) {
    if (!isCall(option)) continue;
    const items = (store.get(about.head)?.relations ?? [])
      .filter((r) => r.context !== undefined && isCall(r.context) && r.context.head === option.head && isCall(r.claim) && r.claim.head === "SameAs")
      .map((r) => (isCall(r.claim) && isCall(r.claim.args[0]?.value) ? r.claim.args[0].value.args[0]?.value : undefined))
      .filter((q): q is string => typeof q === "string");
    for (const item of items) {
      if (item === target || (await reachesInWikidata(item, target).catch(() => undefined))) {
        fits.push(option.head);
        break;
      }
    }
  }
  return fits.length === 1 ? { name: about.head, chosen: fits[0], said: was, sense: true } : undefined;
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
  // The question may be a few turns back: "the pie" missed, "sweet pie" still answers it.
  // Only while it is still open: once something was answered, the question has moved on.
  let asked: string | undefined;
  for (const h of (options.history ?? []).slice(-3).reverse()) {
    if (h.result?.startsWith("Which(")) asked = h.result;
    if (asked || /^(Answer|Describes)\(/.test(h.result ?? "")) break;
  }
  // "No, I mean the math term", just after something was described: the sense it was taken in
  // was not the one meant. The word's senses are looked up again for the one those words fit,
  // and what was asked before is asked again.
  const last = options.history?.[options.history.length - 1];
  const meant = /^\s*(?:no+|nope|not (?:that|it))?[\s,.!]*(?:i|we)\s+(?:mean|meant)\s+(?:the\s+|a\s+|an\s+)?(.+?)[.!?]*$/i.exec(message);
  let correcting: string | undefined;
  if (meant && last?.result?.startsWith("Describes(")) {
    try {
      const described = parse(last.result);
      const about = isCall(described) ? described.args[0]?.value : undefined;
      if (about !== undefined && isCall(about)) {
        const regrounded = await regroundSense(runtime.store, about.head, meant[1]).catch(() => undefined);
        if (regrounded) {
          correcting = meant[1];
          message = last.message;
        }
      }
    } catch {
      // Not a description that can be read: the words are heard as they are.
    }
  }
  let answering = asked ? answerToWhich(asked, message, parse, runtime.store) : undefined;
  if (asked) {
    // What the reply is: a thing named ("the animal?", "the taxon") picks, a question in the
    // words packs declare ("what is a taxon?") asks about an option rather than picking it.
    const reply = await hear(runtime.store, message, options).catch(() => undefined);
    let line = reply?.expression;
    let mood: string | undefined;
    while (line !== undefined && isCall(line) && (line.head === "ContextScope" || line.head === "Mood") && line.args.length === 2) {
      const facet = line.args[0].value;
      if (isCall(facet)) mood = facet.head;
      line = line.args[1].value;
    }
    // A question ("what is a taxon?") asks about an option rather than picking it; a thing
    // named or described ("the written message from one to another") picks. A question is told
    // by a word in it of the mood it was heard in (What is Interrogative), read off the reply.
    const declared = (h: string) => (runtime.store.get(h)?.realizations ?? []).some((r) => !r.retired);
    const asking = mood !== undefined && line !== undefined && [...walk(line)].some((x) => isCall(x) && typesOf(runtime.store, c(x.head)).includes(mood!));
    if (answering && asking) answering = undefined;
    // A kind no option is worded as ("the animal?", of the taxon and the band): the option whose
    // thing the world says is one of those.
    if (!answering && line !== undefined && isCall(line) && !line.args.length && !declared(line.head)) answering = await pickByKind(runtime.store, asked, line.head, message, parse);
  }
  // A name picks a person; a sense picks what a word is taken to mean ("the dessert").
  const chosen = new Map(answering && !answering.sense ? [[answering.name, answering.chosen]] : []);
  const pickedSense = answering?.sense ? answering.chosen : undefined;
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
  // The graph's multi-word names the message says, heard so their folds are there to read
  // ("ice cream" is IceCream).
  await foldPhrases(runtime.store, message);
  const hearMessage = async (): Promise<EarsResult> =>
    options.inputMode === "expression" ? exactExpression(message) : hear(runtime.store, message, options);
  let heard = await hearMessage();
  if (heard.expression === undefined) {
    return {
      heard,
      expression: undefined,
      parsed: undefined,
      resolved: [],
      resolvedNames: [],
      result: undefined,
      rendered: "(nothing parsed)",
      spoken: "I could not read that as Concepts.",
      spokenBy: "plain",
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
  const read = async (
    h: EarsResult,
  ): Promise<{ expression: Expr; resolved: { reference: string; to: string }[]; resolvedNames: NameResolution[] }> => {
    // A pronoun for a person first, so "him" is not taken for the last answer; then what the
    // conversation has in play of the kind the word points at ("he" after a list of wives is
    // still the man they married); the last answer only after that.
    const person = h.expression === undefined ? undefined : resolvePronouns(runtime.store, h.expression);
    const pointed = person === undefined ? undefined : await pointAt(runtime, person);
    const { expression: maybe, resolved } = resolveReferences(pointed, options.history ?? []);
    const { expression: named, resolved: resolvedNames } = resolveNames(
      runtime.store,
      maybe ?? h.expression!,
      runtime.ambiguities,
      chosen,
    );
    return { expression: named, resolved, resolvedNames };
  };
  let { expression, resolved, resolvedNames } = await read(heard);
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
      if (!outcome.steps.length || rereads + 1 >= maxReads || options.inputMode === "expression") break;

      const again = await hearMessage();
      if (again.expression === undefined) break;
      rereads += 1;
      const next = await read(again);
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

  // A facet word may be what is asked about, not a setting: "what is python" lifted Python into
  // the context and left What(Is()). When the lifted reading is no answer, the words are worked
  // out again with the facet left where it was said, as a thing, and that is kept if it answers.
  if (!which && !equal(running, expression)) {
    const unanswered = (r: Expr | undefined) => r === undefined || holdsResidual(runtime, r) || learnable(runtime, collectGaps(runtime, r)).length > 0 || unknownAnswer(r, runtime.store);
    if (unanswered(result)) {
      let again: Expr | undefined;
      try {
        if (options.learn !== false) {
          const outcome = await learn(runtime, message, expression, given, { ...options, asked: new Set<string>() });
          again = outcome.result;
          if (!unanswered(again)) learned = [...learned, ...outcome.steps];
        } else {
          runtime.reset();
          again = await runtime.evaluate(expression, given);
        }
      } catch {
        again = undefined;
      }
      if (!unanswered(again)) {
        result = again;
        running = expression;
        context = given;
      } else {
        // The first reading stands: its trace is the one reported.
        runtime.reset();
        try {
          result = await runtime.evaluate(running, context);
        } catch (caught) {
          failed = caught instanceof ConceptError ? format(caught.value) : String(caught);
        }
      }
    }
  }

  // Several senses and nothing said to pick one: asked, not guessed.
  const conversation = [message, correcting ?? "", ...(options.history ?? []).map((h) => h.message)].join(" ");
  result = pickSense(result, conversation, message, pickedSense);
  // An aside whose words are not known yet ("yeah np") does not stop the answer beside it: what
  // was noted of it is left out of the reply, not the reply out of the turn.
  if (result !== undefined && isCall(result) && result.head === "Sequence" && result.args.some((a) => isCall(a.value) && a.value.head === "Answer")) {
    const unknown = new Set(collectGaps(runtime, result).map((g) => g.identity));
    const kept = result.args.filter((a) => !(isCall(a.value) && a.value.head === "Noted" && [...walk(a.value)].some((n) => isCall(n) && unknown.has(n.head))));
    if (kept.length && kept.length < result.args.length) result = kept.length === 1 ? kept[0].value : call("Sequence", kept);
  }
  const rendered = result !== undefined ? format(result) : (failed ?? "(no result)");
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
  const graphSpoken = options.speak !== false && result !== undefined && !uncomputed && !unrealized.length
    ? await graphText(runtime, "RenderResponse", result)
    : undefined;
  // Who said it: the graph's own English, or the host's plain wordings.
  let spokenBy: TurnResult["spokenBy"] = graphSpoken !== undefined ? "graph" : "plain";
  const spoken =
    options.speak === false || result === undefined
      ? rendered
      : graphSpoken ?? await say(message, forSaying(runtime.store, result), { ...options, unrealized, uncomputed, asked: expression});
  if (options.speak === false || result === undefined) spokenBy = "none";

  return {
    heard,
    // What ran, with each line's scope written in it.
    expression: running,
    parsed: format(running),
    resolved,
    resolvedNames,
    result,
    rendered,
    spoken,
    spokenBy,
    gaps,
    ambiguities: [...runtime.ambiguities],
    learned,
    rereads,
    failed,
  };
}
