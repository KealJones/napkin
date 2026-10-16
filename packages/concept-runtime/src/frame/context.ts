/**
 * One context lookup for a hole the words leave open: what fills it, and where that was found.
 * Its sources are asked in turn (this conversation, then memory, then any added later: files, the
 * system, the learning sources); none of them filling it, the hole is asked of the person.
 *
 * A source is a plain function of what is wanted, so more are added without touching the reader
 * (`addContextSource`).
 */
import { type Expr, c, isCall, parse, walk } from "../concept/expression.js";
import type { Runtime } from "../runtime/evaluator.js";
import { typesOf } from "../runtime/types.js";

/** What a hole takes. */
export interface Wanted {
  /** A number ("plus 3", said after an answer), someone ("he"), or anything. */
  readonly kind: "number" | "someone" | "thing";
  /** The word that stands for it, when one does ("he", "it", "that"). */
  readonly word?: string;
}

export interface Found {
  readonly value: Expr;
  /** Which source found it, and how, in plain words. */
  readonly source: string;
  readonly why: string;
}

export interface Context {
  readonly runtime: Runtime;
  readonly message: string;
  readonly history: readonly { readonly message?: string; readonly result?: string; readonly spoken?: string }[];
}

export type ContextSource = { readonly name: string; readonly find: (wanted: Wanted, context: Context) => Promise<Found | undefined> | Found | undefined };

const read = (text: string | undefined): Expr | undefined => {
  if (!text) return undefined;
  try {
    return parse(text);
  } catch {
    return undefined;
  }
};

/** The value an answer gave: Answer(5) is 5. */
const answered = (e: Expr | undefined): Expr | undefined => {
  if (e === undefined) return undefined;
  if (typeof e === "number") return e;
  if (isCall(e) && e.head === "Answer" && e.args[0]) return answered(e.args[0].value) ?? e.args[0].value;
  return undefined;
};

const someone = (runtime: Runtime, e: Expr): boolean =>
  isCall(e) && !e.args.length && (typesOf(runtime.store, e).some((t) => t === "Person" || t === "Someone" || t === "Human") || runtime.store.asSubject(e.head).some((t) => t.predicate === "Named"));

/** What the conversation said last that fits: the last answer, or the last one named that fits. */
const conversation: ContextSource = {
  name: "conversation",
  find: (wanted, { runtime, history }) => {
    for (const [back, h] of [...history].reverse().entries()) {
      const result = read(h.result);
      const value = answered(result);
      if (wanted.kind === "number" && typeof value === "number") return { value, source: "conversation", why: `the answer ${back ? `${back + 1} messages back` : "just before"}` };
      if (wanted.kind !== "number" && value !== undefined && typeof value !== "number" && (wanted.kind === "thing" || someone(runtime, value))) {
        return { value, source: "conversation", why: `what was answered ${back ? `${back + 1} messages back` : "just before"}` };
      }
      if (wanted.kind === "someone" && result !== undefined) {
        const named = [...walk(result)].filter((n) => someone(runtime, n));
        if (named.length) return { value: named.at(-1)!, source: "conversation", why: "who was named before" };
      }
    }
    return undefined;
  },
};

/** What the graph holds the conversation is about: the thing a pointing word was last taken to mean. */
const memory: ContextSource = {
  name: "memory",
  find: (wanted, { runtime }) => {
    const pointed = runtime.context.get("pointed");
    if (typeof pointed === "string" && pointed && wanted.kind !== "number") {
      const value = c(pointed);
      if (wanted.kind === "thing" || someone(runtime, value)) return { value, source: "memory", why: `what "${wanted.word ?? "it"}" was taken to mean` };
    }
    return undefined;
  },
};

const sources: ContextSource[] = [conversation, memory];

/** Another place to look, asked after those already there. */
export function addContextSource(source: ContextSource): void {
  if (!sources.some((s) => s.name === source.name)) sources.push(source);
}

/** What fills a hole, from the first source that has it. */
export async function fillFromContext(context: Context, wanted: Wanted): Promise<Found | undefined> {
  for (const source of sources) {
    const found = await source.find(wanted, context);
    if (found) return found;
  }
  return undefined;
}

/** The hole the last reply asked to have filled ("9 minus what?"), if it asked one. */
export function askedHole(history: Context["history"]): Expr | undefined {
  const last = read(history.at(-1)?.result);
  return last !== undefined && isCall(last) && last.head === "Unfilled" ? last : undefined;
}
