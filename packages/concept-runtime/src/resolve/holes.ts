/**
 * Holes: what a word expects of its neighbours, and filling it from them.
 *
 * A Concept's realizations already say what it takes: Subtract($left, $right) with
 * Types(left = Number(), right = Number()) expects two numbers. Those are its holes. Hearing
 * links words by where they stand; here each word that has holes checks what it was given
 * against them, and the words mend their own arrangement:
 *
 *  - a word given nothing takes the neighbour beside it that fits ("9 minus": Minus takes the 9);
 *  - a hole given a wrapper around what fits takes what is inside ("divided by 0": the 0);
 *  - a helper holding a value among the values a computation takes is saying something of that
 *    computation, not being one of its values ("2 plus 2 is 5" claims the sum is 5);
 *  - a hole nothing fills is reported, with the kind of thing it wants, so it can be asked for
 *    by name ("9 minus what?") and not guessed.
 *
 * Nothing here names a word. What counts as a hole, a wrapper or a computation is read from
 * the realizations and their declared properties (Types, Lossy, Program).
 */
import { type Call, type Expr, c, call, isCall, isVariable, positional } from "../concept/expression.js";
import type { Realization } from "../concept/unit.js";
import { runs } from "../runtime/select.js";
import { typesOf } from "../runtime/types.js";
import type { ConceptStore } from "../store/store.js";

const SCOPE = "ContextScope";
/** A claim found by its holes: the computation, and what was said of it (packs/holes.ncon). */
export const CLAIMED = "Claimed";
/** A hole nothing filled: the call as heard, and the kind of thing it still wants. */
export const UNFILLED = "Unfilled";
/** The kinds a value is on its face (runtime/types.ts names the same three). */
const VALUE_KINDS = ["Number", "String", "Boolean"];

export interface Unfilled {
  /** The call as heard, with what it was given. */
  readonly call: Call;
  /** The kind of thing the hole wants, where it is known. */
  readonly type?: string;
}

/** The Concept a word is a word for (SynonymOf), followed to its end: Minus is Subtract. */
function meant(store: ConceptStore, head: string): string {
  let at = head;
  for (let hop = 0; hop < 4; hop++) {
    const to = (store.get(at)?.relations ?? []).map((r) => (isCall(r.claim) && r.claim.head === "SynonymOf" ? r.claim.args[0]?.value : undefined)).find((x) => x !== undefined && isCall(x));
    if (to === undefined || !isCall(to)) break;
    at = to.head;
  }
  return at;
}

const live = (store: ConceptStore, head: string): Realization[] => (store.get(head)?.realizations ?? []).filter((r) => !r.retired && isCall(r.pattern));
const has = (r: Realization, property: string): boolean => r.properties.some((p) => isCall(p) && p.head === property);
/** A pattern of plain variables only: Subtract($left, $right). Its variables, in order. */
function holes(r: Realization): string[] | undefined {
  if (!isCall(r.pattern)) return undefined;
  const out: string[] = [];
  for (const a of r.pattern.args) {
    if (a.name !== undefined || !isVariable(a.value)) return undefined;
    out.push(a.value.variable);
  }
  return out;
}
/** The plain kinds a realization wants of a variable: Number(), or OneOf(Date(), Time()). */
function wants(r: Realization, variable: string): string[] | undefined {
  const type = r.types !== undefined && isCall(r.types) ? r.types.args.find((a) => a.name === variable)?.value : undefined;
  if (type === undefined || !isCall(type)) return undefined;
  if (!type.args.length) return [type.head];
  const each = type.head === "OneOf" ? positional(type) : [];
  return each.length && each.every((k) => isCall(k) && !k.args.length) ? each.map((k) => (k as Call).head) : undefined;
}
const is = (store: ConceptStore, value: Expr, kinds: readonly string[]): boolean => typesOf(store, value).some((t) => kinds.includes(t));
/** The realizations of what a word means that type what they take, each with its holes. */
function typed(store: ConceptStore, head: string): { r: Realization; holes: string[] }[] {
  return live(store, meant(store, head))
    .filter((r) => runs(r) && r.types !== undefined)
    .flatMap((r) => {
      const h = holes(r);
      return h && h.some((v) => wants(r, v)) ? [{ r, holes: h }] : [];
    });
}
/** A call that works something out: a realization of its own, declared a Program, that drops nothing. */
const computes = (store: ConceptStore, e: Expr): boolean =>
  isCall(e) && [e.head, meant(store, e.head)].some((h) => live(store, h).some((r) => has(r, "Program") && !has(r, "Lossy")));
/**
 * A wrapper: a word holding one thing that does nothing to it. Either its own realization hands
 * back what it holds (declared Lossy: Is, Was), or it has nothing that runs at all and only
 * marks what follows (By, Of).
 */
const wraps = (store: ConceptStore, e: Expr): e is Call =>
  isCall(e) &&
  e.args.length === 1 &&
  e.args[0].name === undefined &&
  store.has(e.head) &&
  (live(store, e.head).some((r) => has(r, "Lossy") && holes(r)?.length === 1) || ![e.head, meant(store, e.head)].some((h) => live(store, h).some(runs)));
/** Whether a hole of these kinds is satisfied by this value as it stands. */
const fills = (store: ConceptStore, value: Expr, kinds: readonly string[] | undefined): boolean => kinds === undefined || is(store, value, kinds) || (computes(store, value) && !wraps(store, value));

export function fillHoles(store: ConceptStore, expression: Expr): { expression: Expr; unfilled?: Unfilled; changed: boolean } {
  let unfilled: Unfilled | undefined;
  let changed = false;

  const mend = (e: Expr, mood: string | undefined): Expr => {
    if (!isCall(e)) return e;
    if (e.head === SCOPE && e.args.length === 2) {
      const facet = e.args[0].value;
      return { head: e.head, args: [e.args[0], { ...e.args[1], value: mend(e.args[1].value, isCall(facet) ? facet.head : mood) }] };
    }
    let args = e.args.map((a) => ({ ...a, value: mend(a.value, mood) }));
    const plain = args.every((a) => a.name === undefined);

    // A word given nothing takes the neighbour beside it that fits its first hole, then the one after.
    if (plain) {
      for (let i = 0; i < args.length; i++) {
        const word = args[i].value;
        if (!isCall(word) || word.args.length) continue;
        const shapes = typed(store, word.head);
        if (!shapes.length || live(store, meant(store, word.head)).some((r) => holes(r)?.length === 0)) continue;
        const shape = shapes.find((s) => i > 0 && is(store, args[i - 1].value, wants(s.r, s.holes[0]) ?? []));
        if (!shape) continue;
        const taken = [args[i - 1].value];
        const after = args[i + 1]?.value;
        const second = shape.holes[1] === undefined ? undefined : wants(shape.r, shape.holes[1]);
        const takesAfter = after !== undefined && second !== undefined && is(store, after, second);
        if (takesAfter) taken.push(after);
        // The word, now holding something, checks its own holes in turn.
        args = [...args.slice(0, i - 1), { value: mend(c(word.head, ...taken), mood) }, ...args.slice(i + (takesAfter ? 2 : 1))];
        changed = true;
        i -= 1;
      }
    }

    const shapes = plain ? typed(store, e.head) : [];
    const given = args.map((a) => a.value);

    // A helper holding a value, last among the values a computation takes: a claim about it.
    if (plain && mood === "Declarative" && given.length >= 3 && computes(store, { head: e.head, args: [] })) {
      const last = given[given.length - 1];
      const rest = given.slice(0, -1);
      if (wraps(store, last)) {
        const inside = last.args[0].value;
        const kind = VALUE_KINDS.find((k) => is(store, inside, [k]) && rest.every((x) => is(store, x, [k])));
        if (kind !== undefined && !is(store, last, [kind])) {
          changed = true;
          return c(CLAIMED, { head: e.head, args: rest.map((value) => ({ value })) }, inside);
        }
      }
    }

    if (shapes.length) {
      const fit = (values: readonly Expr[]) => shapes.some((s) => s.holes.length === values.length && s.holes.every((v, i) => fills(store, values[i], wants(s.r, v))));
      if (!fit(given)) {
        // A hole given a wrapper around what fits takes what is inside.
        for (const s of shapes) {
          if (s.holes.length !== given.length) continue;
          const opened = given.map((value, i) => {
            const kinds = wants(s.r, s.holes[i]);
            return kinds !== undefined && !fills(store, value, kinds) && wraps(store, value) && is(store, value.args[0].value, kinds) ? value.args[0].value : value;
          });
          if (opened.some((x, i) => x !== given[i]) && fit(opened)) {
            changed = true;
            return { head: e.head, args: opened.map((value) => ({ value })) };
          }
        }
        // Fewer than any realization takes, and what is there fits: a hole is left.
        const takesThisMany = live(store, meant(store, e.head)).some((r) => {
          const p = (r.pattern as Call).args;
          const fixed = p.filter((a) => !(isCall(a.value) && a.value.head === "Rest")).length;
          return fixed < p.length ? fixed <= given.length : fixed === given.length;
        });
        if (!unfilled && given.length >= 1 && !takesThisMany) {
          const shape = shapes.find((s) => s.holes.length > given.length && given.every((value, i) => fills(store, value, wants(s.r, s.holes[i]))));
          const kind = shape ? wants(shape.r, shape.holes[given.length])?.[0] : VALUE_KINDS.find((k) => given.every((x) => is(store, x, [k])));
          if (shape || kind !== undefined) unfilled = { call: { head: e.head, args }, ...(kind === undefined ? {} : { type: kind }) };
        }
      }
    }
    return { head: e.head, args };
  };

  const mended = mend(expression, undefined);
  return { expression: mended, ...(unfilled ? { unfilled } : {}), changed };
}

/** The result a turn gives for a hole nothing filled: asked for, not guessed. */
export const unfilledResult = (u: Unfilled): Expr => call(UNFILLED, [{ value: u.call }, ...(u.type === undefined ? [] : [{ value: c(u.type) }])]);
