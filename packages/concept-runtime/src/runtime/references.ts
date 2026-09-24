/**
 * Resolving a Ref against what was said earlier (concept-spec Part 14).
 *
 * The parser marks a back-reference; it never resolves one, because it cannot — resolution
 * needs history the message does not contain. Memory is lookup rather than resending a
 * transcript: the specific prior turn is found, and only when a parse says one is needed.
 */
import { type Expr, isCall, call, format, parse } from "../concept/expression.js";

export interface PriorTurn {
  readonly message: string;
  /** The IR, which is what a Ref resolves to. */
  readonly result: string;
  /** What was said out loud. Shown to the parser instead of the IR. */
  readonly spoken?: string;
}

const PRONOUN = /^(it|that|this|them|those|these|the answer|the result)$/i;

/**
 * What a reference points at. A bare pronoun means the most recent answer; anything more
 * specific is matched against what was actually said.
 */
function referent(text: string, history: readonly PriorTurn[]): string | undefined {
  if (!history.length) return undefined;
  const trimmed = text.trim();
  if (PRONOUN.test(trimmed)) return history[history.length - 1]?.result;

  const terms = trimmed.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  if (!terms.length) return history[history.length - 1]?.result;

  let best: { score: number; turn: PriorTurn } | undefined;
  for (const turn of history) {
    const haystack = `${turn.message} ${turn.result}`.toLowerCase();
    const score = terms.filter((t) => haystack.includes(t)).length;
    if (score && (!best || score > best.score)) best = { score, turn };
  }
  return best?.turn.result;
}

/**
 * What a turn answered is kept as written, `Answer(4)`: the reference is to that expression,
 * not to its text. What does not read as one (a sentence spoken) stays text.
 */
function referentValue(to: string): Expr {
  try {
    return parse(to);
  } catch {
    return to;
  }
}

export function resolveReferences(
  expression: Expr | undefined,
  history: readonly PriorTurn[],
): { expression: Expr | undefined; resolved: { reference: string; to: string }[] } {
  const resolved: { reference: string; to: string }[] = [];
  if (expression === undefined) return { expression, resolved };

  const walk = (e: Expr): Expr => {
    if (!isCall(e)) return e;
    // "take 10, double it": after the first line of a message, a bare "it" points at the
    // line before, which the Sequence resolves as it runs, not at the last turn.
    if (e.head === "Sequence") {
      return call("Sequence", e.args.map((a, i) => ({ ...a, value: i === 0 ? walk(a.value) : a.value })));
    }
    if (e.head === "Ref") {
      // Already resolved, by the Ears inside the message or by an earlier pass. History
      // must not overwrite it: "it" pointing at a link in this message is not the last answer.
      if (e.args.length > 1) return e;
      const text = e.args[0]?.value;
      if (typeof text === "string") {
        const to = referent(text, history);
        if (to !== undefined) {
          resolved.push({ reference: text, to });
          // Keep the reference visible around what it resolved to, so the record still
          // shows that the user pointed rather than named.
          return call("Ref", [{ value: text }, { name: "resolvedTo", value: referentValue(to) }]);
        }
      }
      return e;
    }
    return call(
      e.head,
      e.args.map((a) => (a.name === undefined ? { value: walk(a.value) } : { name: a.name, value: walk(a.value) })),
    );
  };

  return { expression: walk(expression), resolved };
}
