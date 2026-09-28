/**
 * Writing Concepts as a language: the pack's To rules (code/ncon.ts, packs/javascript.ncon),
 * the other half of reading (code/rewrite.ts).
 *
 * A To rule is a pattern and either a template or Concepts to write instead. A template
 * says where each part goes:
 *   $x   the part, written as an expression
 *   @x   the part, written as a statement
 *   %x   the part, written as the statements of a block: a Sequence's steps, or one
 *   #x   the part, a name, written as it is
 *   &x   the part written as source, then quoted as a string: source held in a string
 * A part bound by `Rest(...)` is written once per element, expressions joined by ", " (a
 * named argument as `name: value`) and statements by "; ".
 *
 * A block that a template starts on a line of its own ("def #n($ps):\n    %b") is written in
 * lines: its statements one per line at that indentation, and a statement written over several
 * lines keeps its own lines under it. A block hole a template starts with continues the lines it
 * is written in. So a language whose blocks are indentation says so in its templates alone.
 *
 * A value is written as JavaScript writes it unless the language gives it a rule of its own,
 * `To(Literal(null), "None")`.
 *
 * A Concept no rule writes is written as what it means when a `meaning` is given: the graph's
 * realization of it by composed Concepts (`Realization(Half($x), body = Divide($x, 2))`),
 * substituted, so `Half(n)` is written `(n / 2)` in any language that writes Divide.
 *
 * `Either("a", "b")` offers templates in order, the first that can be used winning: a
 * concise arrow where its body is an expression, a block where it is not. (Two rules for
 * one pattern would be one shadowing the other, which the store collects.)
 *
 * A rule is for expressions unless it was given `Statement()`. In statement position the
 * statement rules are tried first; an expression is also a statement. An expression rule
 * applies only where each of its expression parts can itself be written as an expression,
 * which is what makes `If(c, Return(x), ...)` an if statement and `If(c, 1, 2)` a
 * conditional, and a lambda whose body returns take a block, with no rule knowing why.
 *
 * Written by a separate walk rather than by evaluating under `Context(JavaScript())`:
 * a program's Concepts hold variables and effects, and writing one must not run it.
 */
import { type Argument, type Expr, format, isCall, isVariable } from "../concept/expression.js";
import { specificity, substitute, type Bindings } from "../concept/match.js";
import { facetAncestors } from "../runtime/select.js";
import type { ConceptStore } from "../store/store.js";
import { expandEach, matches } from "./rewrite.js";

type Part = { text: string } | { hole: string; as: "expression" | "statement" | "block" | "name" | "source" };

interface Rule {
  readonly pattern: Expr;
  readonly statement: boolean;
  /** A template, or Concepts to write instead. */
  readonly parts?: readonly Part[];
  readonly instead?: Expr;
  readonly rest: ReadonlySet<string>;
  readonly rank: number;
}

const HOLE = /([$@%#&])([a-z][A-Za-z0-9]*)/g;
const KINDS = { $: "expression", "@": "statement", "%": "block", "#": "name", "&": "source" } as const;

function templatePieces(template: string): Part[] {
  const out: Part[] = [];
  let at = 0;
  for (let m = HOLE.exec(template); m; m = HOLE.exec(template)) {
    if (m.index > at) out.push({ text: template.slice(at, m.index) });
    out.push({ hole: m[2], as: KINDS[m[1] as keyof typeof KINDS] });
    at = m.index + m[0].length;
  }
  if (at < template.length) out.push({ text: template.slice(at) });
  HOLE.lastIndex = 0;
  return out;
}

const restVariables = (e: Expr, out = new Set<string>()): Set<string> => {
  if (!isCall(e)) return out;
  if (e.head === "Rest" && isVariable(e.args[0]?.value)) out.add(e.args[0].value.variable);
  for (const a of e.args) restVariables(a.value, out);
  return out;
};

/** The To rules for a language and every language it is a superset of, by head. */
export function writingRules(store: ConceptStore, language: string): Map<string, Rule[]> {
  const languages = new Set([language, ...facetAncestors(store, language)]);
  const byHead = new Map<string, Rule[]>();
  let rank = 0;
  for (const unit of store.all()) {
    for (const r of unit.realizations) {
      if (r.retired || r.context === undefined || !isCall(r.pattern) || !isCall(r.context) || r.context.head !== "Context") continue;
      const facets = r.context.args.map((a) => a.value);
      const lang = facets[0];
      if (!isCall(lang) || !languages.has(lang.head) || !facets.some((f) => isCall(f) && f.head === "Writing")) continue;
      const statement = facets.some((f) => isCall(f) && f.head === "Statement");
      const body = r.body;
      const choices: Expr[] = isCall(body) && body.head === "Either" ? body.args.map((a) => a.value) : [body];
      const list = byHead.get(r.pattern.head) ?? [];
      for (const choice of choices) {
        list.push({
          pattern: r.pattern,
          statement,
          ...(typeof choice === "string" ? { parts: templatePieces(choice) } : { instead: choice }),
          rest: restVariables(r.pattern),
          rank: rank++,
        });
      }
      byHead.set(r.pattern.head, list);
    }
  }
  for (const list of byHead.values()) list.sort((a, b) => specificity(b.pattern) - specificity(a.pattern) || a.rank - b.rank);
  return byHead;
}

export interface Writing {
  readonly text: string;
  /** What no rule writes, by head. */
  readonly unwritable: string[];
}

export function writeWith(rules: Map<string, Rule[]>, e: Expr, as: "expression" | "statement" = "statement", meaning?: (e: Expr) => Expr | undefined): Writing {
  const unwritable: string[] = [];
  const expanding = new Set<string>();
  const expressible = new WeakMap<object, boolean>();

  const literal = (e: Expr): string | undefined => {
    if (isVariable(e)) return e.variable;
    if (typeof e === "string") return JSON.stringify(e);
    if (typeof e === "number" || typeof e === "boolean" || e === null) return String(e);
    return undefined;
  };

  const found = (e: Expr, statement: boolean): { rule: Rule; b: Bindings }[] => {
    if (!isCall(e)) return [];
    const out: { rule: Rule; b: Bindings }[] = [];
    for (const rule of rules.get(e.head) ?? []) {
      if (rule.statement && !statement) continue;
      const b: Bindings = new Map();
      if (matches(rule.pattern, e, b)) out.push({ rule, b });
    }
    // In statement position a statement rule comes first; the order is otherwise kept.
    return statement ? [...out.filter((x) => x.rule.statement), ...out.filter((x) => !x.rule.statement)] : out;
  };

  const values = (rule: Rule, b: Bindings, hole: string): Argument[] => {
    const v = b.get(hole);
    if (v === undefined) return [];
    return rule.rest.has(hole) && isCall(v) ? [...v.args] : [{ value: v }];
  };

  /** Whether a rule can be used where an expression is written. */
  const usable = (rule: Rule, b: Bindings): boolean => {
    if (rule.statement) return false;
    if (rule.instead) return canExpress(expandEach(substitute(rule.instead, b)));
    return (rule.parts ?? []).every((p) => !("hole" in p) || p.as !== "expression" || values(rule, b, p.hole).every((a) => canExpress(a.value)));
  };

  const canExpress = (e: Expr): boolean => {
    if (!isCall(e)) return true;
    const known = expressible.get(e);
    if (known !== undefined) return known;
    expressible.set(e, false);
    const means = meaning && !expanding.has(format(e)) ? meaning(e) : undefined;
    const ok = found(e, false).some(({ rule, b }) => usable(rule, b)) || (means !== undefined && canExpress(means));
    expressible.set(e, ok);
    return ok;
  };

  const render = (rule: Rule, b: Bindings, inLines: boolean): string =>
    (rule.parts ?? [])
      .map((p, i, parts) => {
        if ("text" in p) return p.text;
        const before = parts[i - 1];
        const line = before === undefined ? (inLines ? "" : undefined) : "text" in before ? /\n([ \t]*)$/.exec(before.text)?.[1] : undefined;
        const items = values(rule, b, p.hole);
        if (p.as === "source") return items.map((a) => JSON.stringify(write(a.value, "expression"))).join(", ");
        if (p.as === "name") return items.map((a) => (typeof a.value === "string" ? a.value : write(a.value, "expression"))).join(", ");
        if (p.as === "statement") return items.map((a) => write(a.value, "statement")).join("; ");
        if (p.as === "block") {
          // A block's statements: a Sequence's steps, each written as a statement.
          const steps = items.flatMap((a) => (isCall(a.value) && a.value.head === "Sequence" ? a.value.args : [a]));
          // A block that ends without a return is already worth nothing: the Undefined()
          // reading added to say so is not written back.
          const last = steps[steps.length - 1]?.value;
          if (steps.length > 1 && isCall(last) && last.head === "Undefined" && !last.args.length) steps.pop();
          if (line !== undefined) return steps.map((a) => write(a.value, "statement", true)).join("\n").split("\n").join("\n" + line);
          return steps.map((a) => write(a.value, "statement")).join("; ");
        }
        return items.map((a) => (a.name === undefined ? "" : `${a.name}: `) + write(a.value, "expression")).join(", ");
      })
      .join("");

  const write = (e: Expr, position: "expression" | "statement", inLines = false): string => {
    // A language that writes a value its own way says so: To(Literal(true), "True").
    const own = isCall(e) || isVariable(e) ? undefined : (rules.get("Literal") ?? []).find((r) => isCall(r.pattern) && r.pattern.args[0]?.value === e);
    if (own?.parts) return own.parts.map((p) => ("text" in p ? p.text : "")).join("");
    const lit = literal(e);
    if (lit !== undefined) return lit;
    const statement = position === "statement";
    for (const { rule, b } of found(e, statement)) {
      if (!statement && !usable(rule, b)) continue;
      if (statement && !rule.statement && !usable(rule, b)) continue;
      if (rule.instead) return write(expandEach(substitute(rule.instead, b)), position);
      const text = render(rule, b, inLines);
      // An expression standing as a statement must not read as a block or a declaration.
      return statement && !rule.statement && /^(\{|function\b|class\b)/.test(text) ? `(${text})` : text;
    }
    // No rule writes it: what it means, if the graph realizes it by composing Concepts, is
    // written instead, while that is writable. A call being written inside its own meaning is
    // not expanded again (Percent(p, x) means Percent(p) times x; Percent(p) is expanded too).
    const key = isCall(e) ? format(e) : "";
    const means = isCall(e) && meaning && !expanding.has(key) ? meaning(e) : undefined;
    if (means !== undefined && isCall(e)) {
      const before = unwritable.length;
      expanding.add(key);
      const text = write(means, position, inLines);
      expanding.delete(key);
      if (unwritable.length === before) return text;
      unwritable.length = before;
    }
    unwritable.push(isCall(e) ? e.head : format(e));
    return `undefined /* ${isCall(e) ? e.head : "?"} */`;
  };

  // A template may start its lines with a newline; the writing does not.
  return { text: write(e, as).replace(/^\n+/, ""), unwritable };
}
