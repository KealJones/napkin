/**
 * How well a reading fits: what the graph can do with each word where it stands.
 *
 * A word is not understood alone. "pluss" between two numbers is Plus because Plus takes two
 * numbers; "wat" before "is" is What because What takes what follows. So a reading is judged
 * whole, by its words and what they hold: a word the graph does not hold counts against it, a
 * word holding its neighbours in a shape one of its realizations takes counts for it. Nothing
 * is run, so judging a reading changes nothing.
 *
 * The same for every word: no word is named here (AGENTS.md, the one test).
 */
import { type Call, type Expr, c, isCall } from "../concept/expression.js";
import { candidates, UNIVERSAL } from "../runtime/select.js";
import { isWord } from "../ears/parser/words.js";
import type { ConceptStore } from "../store/store.js";

/** The scope a line was heard in, and the line: ContextScope(Interrogative(), ...). */
const SCOPE = "ContextScope";

/** A word the graph holds nothing of: some sign the reading is off, less than a hold is a sign it is right. */
const UNKNOWN = 0.5;
/** A hold by a pattern that takes anything. */
const ANYTHING = 0.25;
/** Each line more than one: words that fell apart did not find each other, which outweighs any one hold. */
const BROKEN = 1.5;

export interface Fit {
  readonly score: number;
  /** Heads the graph holds nothing of. */
  readonly unknown: string[];
  /** Calls a realization of their own head takes as they stand. */
  readonly held: number;
  /** Of those, the ones taken by a pattern that says something of what it takes: a neighbour confirming the word. */
  readonly firm: number;
  /** How many lines the message was heard as. */
  readonly lines: number;
}

/** The Concept another is a word for: Times is Multiply (SynonymOf), and takes what Multiply takes. */
function wordFor(store: ConceptStore, head: string): string | undefined {
  for (const r of store.get(head)?.relations ?? []) {
    const to = isCall(r.claim) && r.claim.head === "SynonymOf" ? r.claim.args[0]?.value : undefined;
    if (to !== undefined && isCall(to)) return to.head;
  }
  return undefined;
}

/** A pattern that says something of what it takes: more than one thing, a typed thing, or a thing of a given shape. */
const says = (pattern: Expr, types: Expr | undefined): boolean =>
  (types !== undefined && isCall(types) && types.args.length > 0) ||
  (isCall(pattern) && (pattern.args.length > 1 || pattern.args.some((a) => isCall(a.value) && a.value.head !== "Rest")));

/**
 * How firmly a realization of this head's own lineage (not the universal parent's) takes the
 * call as it stands: 1 when its pattern says something of what it takes, a little when it takes
 * anything at all (a helper holding whatever follows is weak evidence the word was meant), 0
 * when none does.
 */
export function takes(store: ConceptStore, node: Call, context: Expr, depth = 0): number {
  const found = candidates(store, node, context, new Set()).filter((f) => f.owner !== UNIVERSAL);
  if (!found.length) return 0;
  if (found.some((f) => says(f.realization.pattern, f.realization.types))) return 1;
  const target = depth < 4 ? wordFor(store, node.head) : undefined;
  return Math.max(ANYTHING, target === undefined ? 0 : takes(store, { head: target, args: node.args }, context, depth + 1));
}

export function fit(store: ConceptStore, expression: Expr | undefined): Fit {
  const unknown: string[] = [];
  let held = 0;
  let firm = 0;
  let score = 0;
  const visit = (e: Expr, context: Expr): void => {
    if (!isCall(e)) return;
    if (e.head === SCOPE && e.args.length === 2) {
      visit(e.args[1].value, c("Context", c("Execution"), e.args[0].value));
      return;
    }
    if (!store.has(e.head)) {
      unknown.push(e.head);
      // A word English has is only one the graph has not met yet; a non-word may be a slip.
      if (!isWord(e.head)) score -= UNKNOWN;
    } else if (e.args.length) {
      const firmly = takes(store, e, context);
      if (firmly > 0) held += 1;
      if (firmly === 1) firm += 1;
      score += firmly;
    }
    for (const a of e.args) visit(a.value, context);
  };
  // Several lines are a Sequence of scopes; each is judged in its own.
  if (expression !== undefined) visit(expression, c("Execution"));
  // A message that fell into more lines than it has sentences was not read as a whole.
  const lines = expression === undefined ? 0 : isCall(expression) && expression.head === "Sequence" ? expression.args.length : 1;
  score -= BROKEN * Math.max(0, lines - 1);
  return { score, unknown, held, firm, lines };
}
