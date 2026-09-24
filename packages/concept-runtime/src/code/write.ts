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

export function templatePieces(template: string): Part[] {
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

export function writeWith(rules: Map<string, Rule[]>, e: Expr, as: "expression" | "statement" = "statement"): Writing {
  const unwritable: string[] = [];
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
    const ok = found(e, false).some(({ rule, b }) => usable(rule, b));
    expressible.set(e, ok);
    return ok;
  };

  const render = (rule: Rule, b: Bindings): string =>
    (rule.parts ?? [])
      .map((p) => {
        if ("text" in p) return p.text;
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
          return steps.map((a) => write(a.value, "statement")).join("; ");
        }
        return items.map((a) => (a.name === undefined ? "" : `${a.name}: `) + write(a.value, "expression")).join(", ");
      })
      .join("");

  const write = (e: Expr, position: "expression" | "statement"): string => {
    const lit = literal(e);
    if (lit !== undefined) return lit;
    const statement = position === "statement";
    for (const { rule, b } of found(e, statement)) {
      if (!statement && !usable(rule, b)) continue;
      if (statement && !rule.statement && !usable(rule, b)) continue;
      if (rule.instead) return write(expandEach(substitute(rule.instead, b)), position);
      const text = render(rule, b);
      // An expression standing as a statement must not read as a block or a declaration.
      return statement && !rule.statement && /^(\{|function\b|class\b)/.test(text) ? `(${text})` : text;
    }
    unwritable.push(isCall(e) ? e.head : format(e));
    return `undefined /* ${isCall(e) ? e.head : "?"} */`;
  };

  return { text: write(e, as), unwritable };
}
