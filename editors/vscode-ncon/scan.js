// @ts-check
/**
 * The one scanner behind the colors: every token in a .ncon text, and how deep each head
 * and parenthesis sits. Shared by the extension and the preview, so what the preview shows
 * is what the editor paints.
 *
 * Heads and parentheses take their nesting depth's color. Everything else has one color
 * of its own. JavaScript held in a Code(source="""...""") body or a Prelude is left to the
 * grammar, which highlights it as JavaScript.
 */

/**
 * @typedef {"head" | "form" | "open" | "close" | "comma" | "comment" | "string" | "raw" | "code" |
 *   "variable" | "local" | "anonymous" | "name" | "equals" | "number" | "constant" | "escape"} Kind
 * @typedef {"form" | "define" | "keyword" | "declare" | "constant" | "kind" | "syntax" | "call"} Role
 * @typedef {{ kind: Kind, start: number, end: number, depth: number, form?: boolean, role?: Role, of?: string }} Mark
 */

/**
 * Heads whose first argument names a local. `Bind($x, value, body)` makes $x a local in its
 * body (not in its value); `Bind($x, value)` as a step of a Sequence makes it a local in the
 * steps after it. Mutable locals are a Cell bound either way.
 */
const BINDERS = ["Bind", "Let", "Inline", "Var"];

/**
 * What a head is, for the syntax style, read the way TypeScript is colored: control flow like
 * `return`, binders and declarations like `const` and `function`, constants like `false`, a
 * nullary Concept (a kind, a facet) like a type, and any other call like a function call.
 */
const KEYWORDS = new Set(["If", "Return", "Sequence", "ForOf", "For", "While", "LoopOver", "LoopWhile", "LoopFor", "LoopDo", "Break", "Continue", "Throw", "Try", "Catch", "Finally", "Await", "Async", "Yield", "YieldEach", "Fail", "Attempt", "Returned", "Export", "Import", "ReExport", "ExportDefault"]);
// Logic and comparison read like operators, which Monokai also draws pink.
for (const op of ["And", "Or", "Not", "Equals", "NotEquals", "Identical", "NotIdentical", "GreaterThan", "LessThan", "AtLeast", "AtMost", "In", "InstanceOf", "TypeOf", "Otherwise", "Truthy"]) KEYWORDS.add(op);
const DECLARES = new Set(["Bind", "Let", "Inline", "Var", "Lambda", "Cell", "Func", "Realization", "Relation", "Class", "Method", "Constructor", "Code"]);
const CONSTANTS = new Set(["True", "False", "Undefined", "Nothing", "Null", "NotANumber", "UnknownTruth"]);

const FORMS = new Set(["Requires", "Language", "Concept", "Realization", "Compiled", "Prelude", "From", "To", "Relation"]);
const IDENT = /[A-Za-z0-9_]/;

/**
 * @typedef {{ name: string, from: number, to: number, binder: [number, number], value: [number, number] }} Scope
 *   where a local holds (from, to), where it is named (binder), and the text it is bound to (value)
 */

/**
 * @param {string} text
 * @param {{ binders?: readonly string[] }} [options]
 * @typedef {{ head: string, index: number, start: number, named: boolean }} ArgStart
 *   where each argument of a call begins, which argument it is, and whether it is named
 * @returns {{ marks: Mark[], unbalanced: number[], scopes: Scope[], args: ArgStart[] }}
 */
function scan(text, options = {}) {
  const binders = new Set(options.binders ?? BINDERS);
  /** @type {{ head: string, arg: number, seen: boolean, form?: boolean, binds?: Mark, value?: number, body?: number, later?: Scope[] }[]} */
  const frames = [];
  /** @type {Scope[]} */
  const scopes = [];
  /** @type {ArgStart[]} */
  const args = [];
  let pendingHead = "";
  let pendingForm = false;
  /** @type {Mark[]} */
  const marks = [];
  /** @type {number[]} */
  const unbalanced = [];
  /** @type {number[]} */
  const stack = [];
  const n = text.length;
  const mark = (/** @type {Kind} */ kind, /** @type {number} */ start, /** @type {number} */ end) => {
    const m = { kind, start, end, depth: stack.length };
    marks.push(m);
    // The first thing in a binder's first argument: a variable there is the local it names.
    const frame = frames[frames.length - 1];
    if (frame && !frame.seen && kind !== "comment") {
      frame.seen = true;
      if (kind !== "close") args.push({ head: frame.head, index: frame.arg, start, named: kind === "name" });
      if (frame.arg === 0 && kind === "variable" && binders.has(frame.head)) frame.binds = m;
    }
  };
  let i = 0;
  // What the last name was, so a raw string after `source=` or `Prelude(` is known as code.
  let lastName = "";
  let lastHead = "";
  while (i < n) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? n : end;
      mark("comment", i, stop);
      i = stop;
      continue;
    }
    if (text.startsWith('"""', i)) {
      const end = text.indexOf('"""', i + 3);
      const stop = end < 0 ? n : end + 3;
      mark(lastName === "source" || lastHead === "Prelude" ? "code" : "raw", i, stop);
      i = stop;
      lastName = lastHead = "";
      continue;
    }
    if (ch === '"') {
      const start = i++;
      while (i < n && text[i] !== '"' && text[i] !== "\n") {
        if (text[i] === "\\") {
          marks.push({ kind: "escape", start: i, end: i + 2, depth: stack.length });
          i += 2;
        } else i++;
      }
      i = Math.min(n, i + 1);
      marks.push({ kind: "string", start, end: i, depth: stack.length });
      lastName = lastHead = "";
      continue;
    }
    if (ch === "$" && /[A-Za-z_]/.test(text[i + 1] ?? "")) {
      let e = i + 1;
      while (e < n && IDENT.test(text[e])) e++;
      mark(text.slice(i, e) === "$_" ? "anonymous" : "variable", i, e);
      i = e;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let e = i;
      while (e < n && IDENT.test(text[e])) e++;
      const word = text.slice(i, e);
      let k = e;
      while (k < n && (text[k] === " " || text[k] === "\t")) k++;
      if (text[k] === "(" && /[A-Z]/.test(ch)) {
        const atLineStart = i === 0 || /\n[ \t]*$/.test(text.slice(Math.max(0, i - 80), i));
        const form = stack.length === 0 && atLineStart && FORMS.has(word);
        const parent = frames[frames.length - 1];
        let after = k + 1;
        while (after < n && /\s/.test(text[after])) after++;
        /** @type {Role} */
        const role = form ? "form"
          : parent?.form && parent.head === "Concept" && parent.arg === 0 && !parent.seen ? "define"
          : /^Js[A-Z]/.test(word) ? "syntax"
          : KEYWORDS.has(word) ? "keyword"
          : DECLARES.has(word) ? "declare"
          : CONSTANTS.has(word) ? "constant"
          : text[after] === ")" ? "kind"
          : "call";
        mark(form ? "form" : "head", i, e);
        marks[marks.length - 1].role = role;
        lastHead = word;
        pendingHead = word;
        pendingForm = form;
      } else if (text[k] === "=" && text[k + 1] !== "=") {
        mark("name", i, e);
        mark("equals", k, k + 1);
        lastName = word;
        i = k + 1;
        continue;
      } else if (word === "true" || word === "false" || word === "null") {
        mark("constant", i, e);
      }
      i = e;
      continue;
    }
    if ((ch === "-" && /[0-9]/.test(text[i + 1] ?? "")) || (/[0-9]/.test(ch) && !IDENT.test(text[i - 1] ?? ""))) {
      const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
      if (m) {
        mark("number", i, i + m[0].length);
        i += m[0].length;
        continue;
      }
    }
    if (ch === "(") {
      mark("open", i, i + 1);
      marks[marks.length - 1].of = pendingHead || undefined;
      // A form's parentheses are the form's, not the rainbow's.
      if (pendingForm) marks[marks.length - 1].form = true;
      stack.push(i);
      frames.push({ head: pendingHead, arg: 0, seen: false, form: pendingForm, later: [] });
      pendingHead = "";
      pendingForm = false;
      i++;
      continue;
    }
    if (ch === ")") {
      if (stack.length) {
        stack.pop();
        const frame = frames.pop();
        if (frame?.binds) {
          const name = text.slice(frame.binds.start, frame.binds.end);
          frame.binds.kind = "local";
          /** @type {[number, number]} */
          const binder = [frame.binds.start, frame.binds.end];
          /** @type {[number, number]} */
          const value = [frame.value ?? i, frame.body ?? i];
          if (frame.body !== undefined) scopes.push({ name, from: frame.body, to: i, binder, value });
          // A two-argument binding is a step: its local holds for the steps after it.
          else if (frame.arg === 1) frames[frames.length - 1]?.later?.push({ name, from: i, to: i, binder, value });
        }
        for (const l of frame?.later ?? []) scopes.push({ ...l, to: i });
        mark("close", i, i + 1);
        if (frame?.form) marks[marks.length - 1].form = true;
      } else unbalanced.push(i);
      i++;
      lastName = lastHead = "";
      continue;
    }
    if (ch === ",") {
      const frame = frames[frames.length - 1];
      // A comma knows whose arguments it separates, for the operator drawn after it.
      if (stack.length) marks.push({ kind: "comma", start: i, end: i + 1, depth: stack.length - 1, of: frame?.head });
      if (frame) {
        frame.arg++;
        frame.seen = false;
        if (frame.arg === 1 && frame.binds) frame.value = i + 1;
        // Past the value: what follows is the body, where the local is in scope.
        if (frame.arg === 2 && frame.binds) frame.body = i;
      }
      lastName = lastHead = "";
    }
    if (!/\s/.test(ch)) {
      pendingHead = "";
      pendingForm = false;
    }
    i++;
  }
  unbalanced.push(...stack);
  // Every use of a local inside the body it was bound for is that local.
  for (const m of marks) {
    if (m.kind !== "variable") continue;
    const name = text.slice(m.start, m.end);
    if (scopes.some((s) => s.name === name && s.from < m.start && m.start < s.to)) m.kind = "local";
  }
  return { marks, unbalanced, scopes, args };
}

/**
 * What a variable at `offset` stands for: the local it names (innermost binding in scope, or
 * the binding it is written in), else the pattern or Lambda that binds it.
 * @param {string} text
 * @param {number} offset inside the variable
 * @param {{ marks: Mark[], scopes: Scope[] }} scanned
 * @returns {{ kind: "local", value: string, valueAt: number, binder: number } | { kind: "pattern" | "parameter", where: string, at: number } | undefined}
 */
function variableAt(text, offset, scanned) {
  const v = scanned.marks.find((m) => (m.kind === "variable" || m.kind === "local" || m.kind === "anonymous") && m.start <= offset && offset <= m.end);
  if (!v) return undefined;
  const name = text.slice(v.start, v.end);
  const bound = scanned.scopes.filter((s) => s.name === name && ((s.binder[0] === v.start) || (s.from < v.start && v.start < s.to)));
  if (bound.length) {
    // The innermost: the binding written here, or the narrowest scope around it.
    const own = bound.find((s) => s.binder[0] === v.start);
    const s = own ?? bound.sort((a, b) => a.to - a.from - (b.to - b.from))[0];
    const raw = text.slice(s.value[0], s.value[1]);
    const lead = raw.length - raw.trimStart().length;
    return { kind: "local", value: raw.trim(), valueAt: s.value[0] + lead, binder: s.binder[0] };
  }
  // Otherwise the nearest enclosing Lambda whose parameters name it, or the Realization whose pattern does.
  /** @type {{ head: string | undefined, open: number }[]} */
  const stack = [];
  /** @type {{ head: string | undefined, open: number, close: number }[]} */
  const around = [];
  for (const m of scanned.marks) {
    if (m.kind === "open") stack.push({ head: m.of, open: m.start });
    else if (m.kind === "close") {
      const f = stack.pop();
      if (f && f.open < v.start && v.start < m.start) around.push({ ...f, close: m.start });
    }
  }
  around.sort((a, b) => b.open - a.open);
  for (const f of around) {
    if (f.head !== "Lambda" && f.head !== "Realization") continue;
    // The first argument: a Lambda's parameters, a Realization's pattern.
    let depth = 0;
    let end = f.open + 1;
    for (; end < f.close; end++) {
      const ch = text[end];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) break;
    }
    const raw = text.slice(f.open + 1, end);
    const first = raw.trim();
    const hit = [...raw.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*/g)].find((m) => m[0] === name);
    if (hit) return { kind: f.head === "Lambda" ? "parameter" : "pattern", where: first, at: f.open + 1 + (hit.index ?? 0) };
  }
  return undefined;
}

/** Monokai, one color per nesting level, cycling. Never yellow or orange: those are strings and variables. */
const RAINBOW = ["#F92672", "#A6E22E", "#66D9EF", "#AE81FF", "#5FD7AF", "#FF6AC1", "#7AA2F7"];

/**
 * Everything that is not nesting, in Monokai. Comments are left to the theme (the grammar
 * scopes them as comments), so they look exactly as they do in every other language.
 */
const PALETTE = {
  form: { color: "#66D9EF", fontStyle: "italic" },
  string: { color: "#E6DB74" },
  raw: { color: "#E6DB74" },
  escape: { color: "#AE81FF" },
  variable: { color: "#FD971F", fontStyle: "italic" },
  anonymous: { color: "#75715E", fontStyle: "italic" },
  local: { color: "#F8F8F2", fontStyle: "italic" },
  name: { color: "#F8F8F2", fontStyle: "italic" },
  equals: { color: "#F92672" },
  number: { color: "#AE81FF" },
  constant: { color: "#AE81FF" },
  comma: { color: "#F8F8F2" },
};

/**
 * The operator a Concept is, drawn faintly after each comma between its arguments, so
 * `And($a, $b)` reads `And($a, && $b)`. Display only: it is not in the file.
 */
const GHOSTS = {
  And: "&&", Or: "||", Otherwise: "??",
  Equals: "==", NotEquals: "!=", Identical: "===", NotIdentical: "!==",
  GreaterThan: ">", LessThan: "<", AtLeast: ">=", AtMost: "<=",
  Add: "+", Subtract: "-", Multiply: "*", Divide: "/", Modulo: "%", Power: "**",
  In: "in", InstanceOf: "instanceof",
};

/**
 * The call the cursor is inside, and which argument it is in: for signature help.
 * @param {string} text
 * @param {number} offset
 * @returns {{ head: string, index: number, argument: string } | undefined} `argument` is the
 *   text of the argument being written, up to the cursor
 */
function callAt(text, offset) {
  const { marks } = scan(text.slice(0, offset));
  /** @type {{ head: string | undefined, depth: number, commas: number, from: number }[]} */
  const open = [];
  for (const m of marks) {
    if (m.kind === "open") open.push({ head: m.of, depth: m.depth, commas: 0, from: m.end });
    else if (m.kind === "close") open.pop();
    else if (m.kind === "comma" && open.length && m.depth === open[open.length - 1].depth) {
      open[open.length - 1].commas++;
      open[open.length - 1].from = m.end;
    }
  }
  const top = open[open.length - 1];
  return top?.head ? { head: top.head, index: top.commas, argument: text.slice(top.from, offset) } : undefined;
}

/**
 * The variables in scope at an offset: locals bound around it, and the variables of the
 * patterns and Lambdas it is inside.
 * @param {string} text
 * @param {number} offset
 * @param {{ marks: Mark[], scopes: Scope[] }} scanned
 * @returns {{ name: string, kind: "local" | "pattern" | "parameter", detail: string }[]}
 */
function variablesAt(text, offset, scanned) {
  /** @type {Map<string, { name: string, kind: "local" | "pattern" | "parameter", detail: string }>} */
  const found = new Map();
  const inner = scanned.scopes.filter((s) => s.from < offset && offset <= s.to).sort((a, b) => a.to - a.from - (b.to - b.from));
  for (const s of inner) if (!found.has(s.name)) found.set(s.name, { name: s.name, kind: "local", detail: text.slice(s.value[0], s.value[1]).trim().replace(/\s+/g, " ").slice(0, 80) });
  /** @type {{ head: string | undefined, open: number }[]} */
  const stack = [];
  for (const m of scanned.marks) {
    if (m.start >= offset) break;
    if (m.kind === "open") stack.push({ head: m.of, open: m.start });
    else if (m.kind === "close") stack.pop();
  }
  for (const f of stack.reverse()) {
    if (f.head !== "Lambda" && f.head !== "Realization") continue;
    let depth = 0;
    let end = f.open + 1;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (ch === "(") depth++;
      else if (ch === ")") { if (depth-- === 0) break; }
      else if (ch === "," && depth === 0) break;
    }
    const first = text.slice(f.open + 1, end).trim();
    for (const m of first.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*/g)) {
      if (!found.has(m[0]) && m[0] !== "$_") found.set(m[0], { name: m[0], kind: f.head === "Lambda" ? "parameter" : "pattern", detail: first.replace(/\s+/g, " ") });
    }
  }
  return [...found.values()];
}

/**
 * Parameter names for heads no pack gives a pattern with variables: pack forms, markers, and
 * the code IR's structural nodes.
 */
const PARAMETERS = {
  Concept: ["name"],
  Realization: ["pattern"],
  Lambda: ["parameters", "body"],
  Member: ["object", "property"],
  Index: ["object", "index"],
  Relation: ["claim"],
};

/**
 * The parameter names a realization pattern gives its positional arguments, by position:
 * `If($condition, $then, $otherwise)` gives condition, then, otherwise. A position whose
 * pattern is not a plain variable gets none, and Rest names nothing.
 * @param {string} pattern
 * @returns {(string | undefined)[] | undefined}
 */
function parameterNames(pattern) {
  const open = pattern.indexOf("(");
  if (open < 0 || !pattern.endsWith(")")) return undefined;
  const inner = pattern.slice(open + 1, -1);
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(inner.slice(from, i).trim());
      from = i + 1;
    }
  }
  if (inner.trim()) parts.push(inner.slice(from).trim());
  if (parts.some((p) => /^[A-Za-z_]\w*\s*=/.test(p))) return undefined;
  return parts.map((p) => /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(p)?.[1]);
}

/** A unary operator, drawn faintly after the opening parenthesis: `Negate(-$x)`. */
const PREFIX_GHOSTS = { Negate: "-", Negative: "-", Not: "!" };

/** The syntax style: heads by role, as TypeScript's tokens are colored in Monokai. */
const ROLES = {
  form: { color: "#66D9EF", fontStyle: "italic" },
  define: { color: "#A6E22E" },
  call: { color: "#A6E22E" },
  keyword: { color: "#F92672" },
  declare: { color: "#66D9EF", fontStyle: "italic" },
  kind: { color: "#66D9EF", fontStyle: "italic" },
  syntax: { color: "#66D9EF", fontStyle: "italic" },
  constant: { color: "#AE81FF" },
};

/** In the syntax style a local and a name read like a TypeScript local and property: plain white. */
const SYNTAX_TOKENS = { ...PALETTE, local: { color: "#F8F8F2" }, name: { color: "#F8F8F2" } };

module.exports = { callAt, variablesAt, parameterNames, PARAMETERS, variableAt, scan, RAINBOW, PALETTE, ROLES, SYNTAX_TOKENS, BINDERS, GHOSTS, PREFIX_GHOSTS };
