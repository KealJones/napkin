/**
 * Reading a language into Concepts: its syntax nodes rewritten by the pack's From rules
 * (code/ncon.ts, packs/javascript.ncon), top-down, until nothing more applies.
 *
 * A From rule is an ordinary realization on the syntax node's Concept, under
 * `Context(<language>, Reading())`, so the rules are graph data: a rule added to the store
 * changes how source reads. The most specific rule applies first (`specificity`, as
 * selection orders realizations), the earlier one on a tie. A rule's output is rewritten
 * again, so a rule can hand work to helper rules, and a node's parts are rewritten after
 * the node.
 *
 * A syntax pattern names only the fields it cares about: `JsCallExpression(expression=$f)`
 * matches any call, and a field the node does not have reads as `Undefined()`.
 *
 * What a rule's output can say besides Concepts:
 *   Variable("x")          the variable $x
 *   Named("k", value)      the named argument k=value in the call around it (Pair when k
 *                          is not a name)
 *   Each(list, Lambda(List($x), out))
 *                          `out` for each element, spliced into the call around it
 *   Erased()               nothing: dropped from the call around it
 *   Parse(text)            text read as source too (source held in a string); anything
 *                          that is not text becomes NotSource(...)
 * and a pattern can say Bind($x, pattern), to match `pattern` and bind all of it to $x.
 */
import { type Argument, type Call, type Expr, c, call, equal, format, isCall, isVariable } from "../concept/expression.js";
import { ANON, specificity, substitute, type Bindings } from "../concept/match.js";
import { facetAncestors } from "../runtime/select.js";
import type { ConceptStore } from "../store/store.js";
import { readSource } from "./read.js";

const UNDEFINED = c("Undefined");
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isSyntax = (head: string): boolean => /^Js[A-Z]/.test(head);

interface Rule {
  readonly pattern: Expr;
  readonly output: Expr;
  readonly rank: number;
}

/** The From rules for a language and every language it is a superset of, by head. */
export function readingRules(store: ConceptStore, language: string): Map<string, Rule[]> {
  const languages = new Set([language, ...facetAncestors(store, language)]);
  const byHead = new Map<string, Rule[]>();
  let order = 0;
  for (const unit of store.all()) {
    for (const r of unit.realizations) {
      if (r.retired || r.context === undefined || !isCall(r.pattern) || !isCall(r.context) || r.context.head !== "Context") continue;
      const [lang, facet] = r.context.args.map((a) => a.value);
      if (!isCall(lang) || !languages.has(lang.head) || !isCall(facet) || facet.head !== "Reading") continue;
      const list = byHead.get(r.pattern.head) ?? [];
      list.push({ pattern: r.pattern, output: r.body, rank: order++ });
      byHead.set(r.pattern.head, list);
    }
  }
  for (const list of byHead.values()) list.sort((a, b) => specificity(b.pattern) - specificity(a.pattern) || a.rank - b.rank);
  return byHead;
}

function matchArgs(expected: readonly Argument[], actual: readonly Argument[], b: Bindings): boolean {
  const last = expected[expected.length - 1]?.value;
  const rest = last !== undefined && isCall(last) && last.head === "Rest" ? last.args[0]?.value : undefined;
  if (rest !== undefined && isVariable(rest)) {
    const fixed = expected.slice(0, -1);
    if (actual.length < fixed.length || !fixed.every((e, i) => matches(e.value, actual[i].value, b))) return false;
    return bind(b, rest.variable, call("List", actual.slice(fixed.length)));
  }
  if (expected.length !== actual.length) return false;
  return expected.every((e, i) => (e.name === undefined || e.name === actual[i].name) && matches(e.value, actual[i].value, b));
}

function bind(b: Bindings, name: string, value: Expr): boolean {
  if (name === ANON) return true;
  const existing = b.get(name);
  if (existing === undefined) {
    b.set(name, value);
    return true;
  }
  return equal(existing, value);
}

export function matches(pattern: Expr, value: Expr, b: Bindings): boolean {
  if (isVariable(pattern)) return bind(b, pattern.variable, value);
  if (!isCall(pattern)) return equal(pattern, value);
  const bound = pattern.head === "Bind" && pattern.args.length === 2 ? pattern.args[0].value : undefined;
  if (bound !== undefined && isVariable(bound)) return matches(pattern.args[1].value, value, b) && bind(b, bound.variable, value);
  if (!isCall(value) || value.head !== pattern.head) return false;
  // A syntax pattern names the fields it reads; the rest of the node is not its business.
  if (isSyntax(pattern.head) && pattern.args.every((a) => a.name !== undefined)) {
    return pattern.args.every((a) => {
      const field = value.args.find((x) => x.name === a.name);
      return matches(a.value, field === undefined ? UNDEFINED : field.value, b);
    });
  }
  return matchArgs(pattern.args, value.args, b);
}

export interface Reading {
  readonly expression: Expr;
  readonly unsupported: { kind: string; source: string }[];
}

/** Source text read as Concepts by these rules. */
export function readWith(rules: Map<string, Rule[]>, text: string, fileName = "input.ts"): Reading {
  const unsupported: { kind: string; source: string }[] = [];
  const { tree, source } = readSource(text, fileName);
  let steps = 0;

  const apply = (e: Call): Expr | undefined => {
    for (const rule of rules.get(e.head) ?? []) {
      const b: Bindings = new Map();
      if (matches(rule.pattern, e, b)) return expandEach(substitute(rule.output, b));
    }
    return undefined;
  };

  const rewrite = (e: Expr): Expr => {
    if (!isCall(e)) return e;
    if (++steps > 2_000_000) throw new Error(`reading ${fileName} did not settle: the rules rewrite in a loop`);
    if (e.head === "Variable" && typeof e.args[0]?.value === "string") return { variable: e.args[0].value };
    // A rule that answers with Each is spliced by the call around it (rewriteArgs).
    if (e.head === "Each") return e;
    if (e.head === "Parse" && e.args.length === 1) {
      const inner = e.args[0].value;
      if (typeof inner !== "string") return rewrite(c("NotSource", inner));
      const read = readWith(rules, inner, `${fileName}#embedded`);
      unsupported.push(...read.unsupported);
      return read.expression;
    }
    const out = apply(e);
    if (out !== undefined) return rewrite(out);
    if (isSyntax(e.head)) {
      const kind = e.head.slice(2);
      const text = source.get(e) ?? format(e).slice(0, 120);
      unsupported.push({ kind, source: text });
      return c("Unsupported", kind, text);
    }
    const args = rewriteArgs(e.args);
    const rebuilt = call(e.head, args);
    if (equal(rebuilt, e)) return rebuilt;
    // A node whose parts changed may now fit a rule: Sequence() once its steps were erased.
    const again = apply(rebuilt);
    return again === undefined ? rebuilt : rewrite(again);
  };

  const rewriteArgs = (args: readonly Argument[]): Argument[] => {
    const out: Argument[] = [];
    const add = (name: string | undefined, raw: Expr) => {
      const value = rewrite(raw);
      if (isCall(value) && value.head === "Each") {
        const spliced = expandEach(call("Splice", [{ value }]));
        for (const a of isCall(spliced) ? spliced.args : []) add(undefined, a.value);
        return;
      }
      if (isCall(value) && value.head === "Erased" && value.args.length === 0) return;
      if (isCall(value) && value.head === "Named" && value.args.length === 2) {
        const [key, v] = value.args.map((a) => a.value);
        if (typeof key === "string" && NAME.test(key)) out.push({ name: key, value: v });
        else out.push({ value: c("Pair", key, v) });
        return;
      }
      out.push(name === undefined ? { value } : { name, value });
    };
    for (const a of args) add(a.name, a.value);
    return out;
  };

  return { expression: rewrite(tree), unsupported };
}

/**
 * `Each(list, Lambda(List($x), out))` spliced into the call around it, as soon as a rule
 * writes it, so the rules that apply next see the elements and not the instruction.
 */
function expandEach(e: Expr): Expr {
  if (!isCall(e) || isSyntax(e.head)) return e;
  const args: Argument[] = [];
  for (const a of e.args) {
    const v = a.value;
    if (isCall(v) && v.head === "Each" && v.args.length === 2) {
      const list = v.args[0].value;
      const fn = v.args[1].value;
      const params = isCall(fn) && fn.head === "Lambda" ? fn.args[0]?.value : undefined;
      const param = params !== undefined && isCall(params) ? params.args[0]?.value : undefined;
      if (!isCall(fn) || param === undefined || !isVariable(param)) throw new Error(`Each needs Lambda(List($x), ...): ${format(v)}`);
      const items = isCall(list) && list.head === "List" ? list.args.map((x) => x.value) : [];
      for (const item of items) args.push({ value: expandEach(substitute(fn.args[1].value, new Map([[param.variable, item]]))) });
      continue;
    }
    args.push(a.name === undefined ? { value: expandEach(v) } : { name: a.name, value: expandEach(v) });
  }
  return call(e.head, args);
}
