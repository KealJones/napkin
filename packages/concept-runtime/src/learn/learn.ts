/**
 * The learning loop (concept-spec Part 12).
 *
 * Realize, collect the gaps, learn what the graph and the world can say (the graph's own
 * clusters, Wikidata, the dictionary), save, re-evaluate. No model teaches: what nothing sourced
 * can say stays a residual.
 *
 * The loop is bounded and every step is traced. A gap that cannot be closed stays a
 * residual, which is an honest outcome and better than a fabricated realization.
 */
import { type Expr, c, call, format, isCall, walk } from "../concept/expression.js";
import { reachesBehaviour } from "../runtime/select.js";
import { groundInWikidata, reachesInWikidata, wikidataItem } from "../research/wikidata.js";
import { ConceptError } from "../runtime/errors.js";
import type { Runtime } from "../runtime/evaluator.js";

import { collectGaps, learnable, type Gap } from "../runtime/turn.js";
import { Relations } from "../store/relations.js";
import { forwardSynonym } from "../seed/seed.js";
import { nameOf } from "../ears/parser/names.js";
import { foldPhrases, sayPhrase } from "../ears/phrase.js";

export interface LearnStep {
  readonly identity: string;
  readonly how: "graph" | "wikidata" | "dictionary" | "phrase" | "research";
  readonly detail: string;
}

export interface LearnResult {
  readonly steps: LearnStep[];
  readonly result: Expr | undefined;
  readonly passes: number;
  readonly remaining: Gap[];
}

/**
 * Step 4: try the graph first.
 *
 * The real defect is disconnection, not absence (concept-spec Part 5.3). If a Concept sits
 * in a cluster that already contains something realizable, it needs attaching rather than
 * teaching, and attaching is free.
 */
export function fromGraph(runtime: Runtime, identity: string): string | undefined {
  // Inheritance counts as connected: a Concept reaching behaviour through IsA needs
  // nothing, and attaching a SynonymOf to it would be noise.
  if (reachesBehaviour(runtime.store, identity)) return undefined;
  // Equivalence only. Following an IsA edge upward would give a category its children's
  // behaviour, which is meaningless — inheritance already runs the other way.
  const cluster = new Relations(runtime.store).cluster(identity, 24, true);
  const realizable = cluster.find((x) => (runtime.store.get(x.identity)?.realizations.length ?? 0) > 0);
  if (!realizable) return undefined;
  // Adding the relation is not enough: behaviour is what was missing, so derive the
  // forwarding realization the relation implies -- but only if the target has behaviour
  // to lend. Forwarding to something that only forwards back is how Hi and Hello ended up
  // pointing at each other until the depth budget stopped them.
  if (!forwardSynonym(runtime.store, identity, realizable.identity)) return undefined;
  runtime.store.addRelation(identity, c("SynonymOf", c(realizable.identity)), undefined, runtime.trace.cause);
  return `forwards to ${realizable.identity}, derived from the synonym relation`;
}

/** CamelCase identities read badly as search queries. */
export function readable(identity: string): string {
  return identity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

/** An answer that says it does not know: Unknown(...), or a truth not known. */
function unknownAnswer(result: Expr | undefined): boolean {
  if (result === undefined || !isCall(result)) return false;
  if (result.head === "Unknown" || result.head === "NoDescription") return true;
  const inner = result.head === "Answer" ? result.args[0]?.value : undefined;
  return inner !== undefined && isCall(inner) && (inner.head === "UnknownTruth" || inner.head === "Unknown");
}

/**
 * The words of what was asked that Napkin holds nothing sourced about: no pack declares them and
 * nothing learned is said of them. Words packs declare ("is", "in", "what") are how questions
 * are asked, not what they are about.
 */
function unsourced(runtime: Runtime, expression: Expr): string[] {
  const out: string[] = [];
  for (const node of walk(expression)) {
    if (!isCall(node) || node.args.length || out.includes(node.head)) continue;
    const unit = runtime.store.get(node.head);
    const declared = unit !== undefined && (unit.realizations.length > 0 || unit.relations.some((r) => r.stamps?.some((st) => st.pack !== undefined)));
    const known = unit !== undefined && unit.relations.some((r) => r.stamps?.some((st) => st.pack === undefined));
    if (!declared && !known) out.push(node.head);
  }
  return out;
}

export async function learn(
  runtime: Runtime,
  message: string,
  expression: Expr,
  context: Expr,
  options: {
    maxPasses?: number;
    research?: boolean;
    /** Identities already asked about, shared across re-readings of one message. */
    asked?: Set<string>;
    /** The conversation so far, whose words help say which sense of a word is meant. */
    history?: readonly { message: string }[];
  } = {},
): Promise<LearnResult> {
  const maxPasses = options.maxPasses ?? 3;
  const steps: LearnStep[] = [];
  let result: Expr | undefined;
  let passes = 0;
  /** Identities already looked up this turn: a lookup that found nothing is not tried again. */
  const attempted = options.asked ?? new Set<string>();
  /** Whether an answer of not knowing has been researched this turn: once is enough. */
  let researched = false;
  /** Whether that research looked for what was asked and did not find it. */
  let notFound = false;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    passes = pass + 1;
    runtime.reset();
    try {
      result = await runtime.evaluate(expression, context);
    } catch (caught) {
      result = caught instanceof ConceptError ? caught.value : undefined;
    }

    const all = collectGaps(runtime, result);
    const gaps = learnable(runtime, all);
    if (!gaps.length) {
      // "I don't know" is where to look further, not where to stop: the words of the question
      // Napkin holds nothing sourced about yet ("tomato" in "is a tomato a fruit") are looked up,
      // once, and the question is worked out again with what was found.
      if (options.research === false || researched || !unknownAnswer(result)) {
        return { steps, result: researched && notFound && unknownAnswer(result) ? call("Answer", [{ value: c("ProbablyNot") }]) : result, passes, remaining: [] };
      }
      researched = true;
      const said = [message, ...(options.history ?? []).map((h) => h.message)].join(" ");
      let found = false;
      for (const identity of unsourced(runtime, expression).slice(0, 4)) {
        if (attempted.has(identity)) continue;
        attempted.add(identity);
        try {
          const grounded = await groundInWikidata(runtime.store, identity, { cause: runtime.trace.cause, said });
          if (grounded?.relations.length) {
            steps.push({ identity, how: "research", detail: `${grounded.item}: ${grounded.relations.map(format).join(", ")}` });
            found = true;
          }
        } catch {
          // Unreachable is not an answer: the question stays as it was.
        }
      }
      // "The tallest mountain": a word said of a kind that Napkin has nothing for may be a
      // superlative, which the world answers across all of the kind (packs/sparql.ncon).
      if (!found) {
        for (const node of walk(expression)) {
          if (!isCall(node) || node.args.length !== 1 || !isCall(node.args[0].value) || node.args[0].value.args.length || runtime.store.get(node.head)?.realizations.length) continue;
          try {
            const answer = await runtime.evaluate(call("Superlative", [{ value: node.head.toLowerCase() }, { value: node.args[0].value }]), c("Execution"));
            if (isCall(answer) && (answer.head === "Superlative" || answer.head === "Either") && answer.args.length > 2) {
              steps.push({ identity: node.head, how: "research", detail: format(answer) });
              return { steps, result: call("Answer", [{ value: answer }]), passes, remaining: [] };
            }
          } catch {
            // Unreachable is not an answer.
          }
        }
      }
      // "Is a tomato a fruit": whether one is a kind of the other is asked of the world's own
      // hierarchy, and what it says is kept as a fact with the way it was found.
      for (const node of walk(expression)) {
        if (!isCall(node) || node.head !== "Is" || node.args.length !== 2) continue;
        const [a, b] = node.args.map((x) => x.value);
        if (!isCall(a) || !isCall(b) || a.args.length || b.args.length) continue;
        const from = wikidataItem(runtime.store, a.head);
        const to = wikidataItem(runtime.store, b.head);
        if (!from || !to) continue;
        try {
          const path = await reachesInWikidata(from, to);
          if (!path) {
            // Looked for and not found, as far as the search went: probably not, which is said
            // as that, never kept as a fact.
            notFound = true;
            continue;
          }
          const record = runtime.store.addRelation("Wikidata", call("Imported", [{ value: from }, { name: "path", value: path.join(" > ") }, { name: "license", value: "CC0" }]), undefined, runtime.trace.cause);
          runtime.store.addRelation(a.head, call("SubclassOf", [{ value: c(b.head) }]), undefined, record.seq);
          steps.push({ identity: a.head, how: "research", detail: `${a.head} is a kind of ${b.head}: ${path.join(" > ")}` });
          found = true;
        } catch {
          // Unreachable is not an answer.
        }
      }
      if (!found) return { steps, result: notFound ? call("Answer", [{ value: c("ProbablyNot") }]) : result, passes, remaining: [] };
      continue;
    }

    let learnedSomething = false;
    // "ice cream" read as Cream(Ice()): the words may name one thing, so the phrase is looked
    // up whole before either word is. Found, it is a Concept with its own fold, and the next
    // pass reads the phrase as it.
    if (options.research !== false) {
      for (const gap of gaps) {
        const phrase = isCall(gap.input) && gap.input.args.length ? await sayPhrase(runtime.store, gap.input) : undefined;
        const name = phrase === undefined ? undefined : nameOf(phrase);
        if (name === undefined || runtime.store.has(name) || attempted.has(name)) continue;
        attempted.add(name);
        const said = [message, ...(options.history ?? []).map((h) => h.message)].join(" ");
        try {
          const grounded = await groundInWikidata(runtime.store, name, { cause: runtime.trace.cause, said });
          let detail = grounded?.relations.length ? `${grounded.item}: ${grounded.relations.map(format).join(", ")}` : undefined;
          if (!detail) {
            const meaning = await runtime.evaluate(call("Meaning", [{ value: c(name) }]), c("Execution"));
            if (isCall(meaning) && meaning.head === "Meaning" && typeof meaning.args[1]?.value === "string") detail = meaning.args[1].value;
          }
          if (!detail || !runtime.store.has(name)) continue;
          await foldPhrases(runtime.store, phrase);
          steps.push({ identity: name, how: "phrase", detail: `"${phrase}" is one thing. ${detail}` });
          learnedSomething = true;
        } catch {
          // Unreachable is not an answer: the words are still looked up one at a time.
        }
      }
      if (learnedSomething) continue;
    }
    for (const gap of gaps) {
      const viaGraph = fromGraph(runtime, gap.identity);
      if (viaGraph) {
        steps.push({ identity: gap.identity, how: "graph", detail: viaGraph });
        learnedSomething = true;
        continue;
      }
      // Teaching a Concept it already knows would pollute it; teaching a REALIZATION it
      // is missing is exactly the point, so only the former is refused.
      if (runtime.store.has(gap.identity) && gap.kind !== "inert" && gap.kind !== "empty") continue;
      if (attempted.has(gap.identity)) continue;
      attempted.add(gap.identity);

      // A word Wikidata knows is grounded there, deterministically and with its source:
      // what a thing is, what it is not, what it is part of. The Teacher, asked to recall
      // the same, invents (it made emoji a synonym of emoticon).
      //
      // Only a word named, not a word applied: Wikidata classifies things. "keep going" made
      // Keep a castle keep and "lol means laugh out loud" made Means a family name, because a
      // word used on arguments is a doing, and the nearest thing sharing its label is not it.
      const named = !isCall(gap.input) || gap.input.args.length === 0;
      const looked = gap.kind === "unknown" || gap.kind === "empty";
      if (looked && named && options.research !== false) {
        try {
          // The sense is the one what was said fits, this message and the ones before it.
          const said = [message, ...(options.history ?? []).map((h) => h.message)].join(" ");
          const grounded = await groundInWikidata(runtime.store, gap.identity, { cause: runtime.trace.cause, said });
          if (grounded?.relations.length) {
            steps.push({ identity: gap.identity, how: "wikidata", detail: `${grounded.item}: ${grounded.relations.map(format).join(", ")}` });
            learnedSomething = true;
            continue;
          }
        } catch {
          // Unreachable is not an answer: fall through to the dictionary.
        }
      }

      // A word's meaning, worked out like a question (packs/words.ncon): what was said about
      // it, then the dictionary sense that fits how it was used. Applied to something, it is
      // a verb.
      if (looked && options.research !== false) {
        try {
          const meaning = await runtime.evaluate(call("Meaning", [{ value: c(gap.identity) }, ...(named ? [] : [{ value: c("Verb") }])]), c("Execution"));
          if (isCall(meaning) && meaning.head === "Meaning" && typeof meaning.args[1]?.value === "string") {
            steps.push({ identity: gap.identity, how: "dictionary", detail: meaning.args[1].value });
            learnedSomething = true;
            continue;
          }
        } catch {
          // Unreachable is not an answer: what nothing sourced can say stays a residual.
        }
      }
    }
    // Nothing new was learned, so another pass repeats this one.
    if (!learnedSomething) break;
  }

  runtime.reset();
  try {
    result = await runtime.evaluate(expression, context);
  } catch (caught) {
    result = caught instanceof ConceptError ? caught.value : result;
  }
  return { steps, result, passes, remaining: collectGaps(runtime, result) };
}
