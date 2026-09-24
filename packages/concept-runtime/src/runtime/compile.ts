/**
 * A realization written in the code IR, compiled to one JavaScript function.
 *
 * Interpreted, the IR runs one Concept at a time through selection, about 15µs a step.
 * Compiled, the whole body is one function: a 1000-step Reduce went from 15ms to 0.2ms.
 * The IR stays the source of truth and the function is a cache, rebuilt from it whenever
 * it is missing, the way a cell caches a fold (concept-spec Part 13).
 *
 * What each primitive compiles to is graph data, from `packs/javascript.ncon`: a realization
 * under `Context(JavaScript(), Compiled())` whose body is `Text(...)`, read here as a template
 * and never evaluated, so compiling can run nothing. The helpers the templates call are the
 * pack's `Prelude`. Binding forms (`Lambda`, `Let`) are
 * compiled here, since they are scope rather than an operation. Anything without a
 * template stays a Concept: the compiled code calls it through `api.evaluate`, so its
 * selection, learning and evidence are what they always were.
 */
import { type Call, type Expr, format, isCall, isVariable } from "../concept/expression.js";
import { match, type Bindings } from "../concept/match.js";
import type { Realization } from "../concept/unit.js";
import type { ConceptStore } from "../store/store.js";

const COMPILED = "Context(JavaScript(), Compiled())";

class NotCompilable extends Error {}

/** The template for a call, filled with the code its arguments compiled to. */
function emit(store: ConceptStore, head: string, codes: string[]): string | undefined {
  const target: Call = { head, args: codes.map((value) => ({ value })) };
  for (const r of store.get(head)?.realizations ?? []) {
    if (r.retired || r.context === undefined || format(r.context) !== COMPILED) continue;
    const bindings: Bindings = new Map();
    if (!match(r.pattern, target, bindings)) continue;
    if (!isCall(r.body) || r.body.head !== "Text") continue;
    const part = (p: Expr): string => {
      if (typeof p === "string") return p;
      if (isVariable(p)) {
        const bound = bindings.get(p.variable);
        if (typeof bound === "string") return bound;
        // A Rest variable binds the rest of the arguments, a List of their code.
        if (bound !== undefined && isCall(bound) && bound.head === "List") return bound.args.map((a) => String(a.value)).join(", ");
      }
      throw new NotCompilable(`template part ${format(p)}`);
    };
    return r.body.args.map((a) => part(a.value)).join("");
  }
  return undefined;
}

function compileExpr(store: ConceptStore, e: Expr, scope: Set<string>): string {
  if (typeof e === "number" || typeof e === "boolean") return String(e);
  if (typeof e === "string") return JSON.stringify(e);
  if (e === null) return "null";
  if (isVariable(e)) {
    if (!scope.has(e.variable)) throw new NotCompilable(`unbound $${e.variable}`);
    return `v_${e.variable}`;
  }
  if (!isCall(e)) throw new NotCompilable("not an expression");
  if (e.head === "Lambda") {
    const params = isCall(e.args[0]?.value) ? (e.args[0].value as Call).args.map((a) => a.value) : [];
    const names = params.map((p) => (isVariable(p) ? p.variable : undefined));
    if (names.some((n) => n === undefined) || e.args[1] === undefined) throw new NotCompilable("lambda shape");
    const inner = new Set([...scope, ...(names as string[])]);
    return `(async (${names.map((n) => `v_${n}`).join(", ")}) => (${compileExpr(store, e.args[1].value, inner)}))`;
  }
  if (e.head === "Let" && e.args.length === 3 && isVariable(e.args[0].value)) {
    const name = e.args[0].value.variable;
    const value = compileExpr(store, e.args[1].value, scope);
    return `(await (async (v_${name}) => (${compileExpr(store, e.args[2].value, new Set([...scope, name]))}))(${value}))`;
  }
  const named = e.args.some((a) => a.name !== undefined);
  const codes = e.args.map((a) => compileExpr(store, a.value, scope));
  const templated = named ? undefined : emit(store, e.head, codes);
  if (templated !== undefined) return templated;
  // A Lambda handed to a Concept that is not compiled would arrive as a JavaScript
  // function it cannot read: that body is left to the interpreter instead.
  if (e.args.some((a) => isCall(a.value) && a.value.head === "Lambda")) throw new NotCompilable(`lambda passed to ${e.head}`);
  // A Concept that reads its arguments unevaluated would get them evaluated: only a
  // variable or a literal, whose value is itself, can be handed to it.
  const lazy = (store.get(e.head)?.realizations ?? []).some((r) => !r.retired && !r.evaluateArguments);
  if (lazy && e.args.some((a) => isCall(a.value) && a.value.args.length > 0)) throw new NotCompilable(`${e.head} reads its arguments unevaluated`);
  // Its arguments are values already: evaluated here, they are not evaluated again there.
  if (!named) return `(await api.apply(${JSON.stringify(e.head)}, [${codes.join(", ")}]))`;
  const args = e.args.map((a, i) => (a.name === undefined ? `{ value: ${codes[i]} }` : `{ name: ${JSON.stringify(a.name)}, value: ${codes[i]} }`));
  return `(await api.evaluate({ head: ${JSON.stringify(e.head)}, args: [${args.join(", ")}] }))`;
}

export type Compiled = (bindings: Bindings, api: unknown) => Promise<Expr>;

/** The variables a pattern binds, which the body may use. */
function patternVariables(pattern: Expr, out = new Set<string>()): Set<string> {
  if (isVariable(pattern)) out.add(pattern.variable);
  else if (isCall(pattern)) for (const a of pattern.args) patternVariables(a.value, out);
  return out;
}

/** The helpers every compiled body shares: the language pack's `Prelude`. */
function prelude(store: ConceptStore): string | undefined {
  const r = store.get("Prelude")?.realizations.find((x) => !x.retired && x.context !== undefined && format(x.context) === COMPILED);
  return typeof r?.body === "string" ? r.body : undefined;
}

/** Undefined when some part of the body has no compiled form; it is then interpreted. */
export function compileRealization(store: ConceptStore, r: Realization): { fn: Compiled; source: string } | undefined {
  const helpers = prelude(store);
  if (helpers === undefined) return undefined;
  const vars = patternVariables(r.pattern);
  let body: string;
  try {
    body = compileExpr(store, r.body, vars);
  } catch (error) {
    if (error instanceof NotCompilable) return undefined;
    throw error;
  }
  const declare = [...vars].map((v) => `const v_${v} = bindings.get(${JSON.stringify(v)});`).join(" ");
  const source = `return (async () => { ${helpers} ${declare} return ${body}; })();`;
  const fn = new Function("bindings", "api", source) as Compiled;
  return { fn, source };
}

/**
 * The compiled form of a realization, built once and kept for the store it was built
 * against. Undefined, and remembered as such, when it cannot be compiled.
 */
const CACHE = new WeakMap<ConceptStore, Map<string, Compiled | null>>();
export function compiledFor(store: ConceptStore, r: Realization): Compiled | undefined {
  let byKey = CACHE.get(store);
  if (!byKey) CACHE.set(store, (byKey = new Map()));
  const key = `${format(r.pattern)}|${r.context === undefined ? "" : format(r.context)}|${format(r.body)}`;
  if (!byKey.has(key)) byKey.set(key, compileRealization(store, r)?.fn ?? null);
  return byKey.get(key) ?? undefined;
}
