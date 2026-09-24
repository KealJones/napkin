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
 * @typedef {{ kind: Kind, start: number, end: number, depth: number, form?: boolean }} Mark
 */

/**
 * Heads whose first argument names a local. `Bind($x, value, body)` makes $x a local in its
 * body (not in its value); `Bind($x, value)` as a step of a Sequence makes it a local in the
 * steps after it. Mutable locals are a Cell bound either way.
 */
const BINDERS = ["Bind", "Let", "Inline", "Var"];

const FORMS = new Set(["Requires", "Language", "Concept", "Realization", "Compiled", "Prelude", "From", "To", "Relation"]);
const IDENT = /[A-Za-z0-9_]/;

/**
 * @param {string} text
 * @param {{ binders?: readonly string[] }} [options]
 * @returns {{ marks: Mark[], unbalanced: number[] }}
 */
function scan(text, options = {}) {
  const binders = new Set(options.binders ?? BINDERS);
  /** @type {{ head: string, arg: number, seen: boolean, form?: boolean, binds?: Mark, body?: number, later?: { name: string, from: number }[] }[]} */
  const frames = [];
  /** @type {{ name: string, from: number, to: number }[]} */
  const scopes = [];
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
        mark(form ? "form" : "head", i, e);
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
          if (frame.body !== undefined) scopes.push({ name, from: frame.body, to: i });
          // A two-argument binding is a step: its local holds for the steps after it.
          else if (frame.arg === 1) frames[frames.length - 1]?.later?.push({ name, from: i });
        }
        for (const l of frame?.later ?? []) scopes.push({ name: l.name, from: l.from, to: i });
        mark("close", i, i + 1);
        if (frame?.form) marks[marks.length - 1].form = true;
      } else unbalanced.push(i);
      i++;
      lastName = lastHead = "";
      continue;
    }
    if (ch === ",") {
      if (stack.length) marks.push({ kind: "comma", start: i, end: i + 1, depth: stack.length - 1 });
      const frame = frames[frames.length - 1];
      if (frame) {
        frame.arg++;
        frame.seen = false;
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
  return { marks, unbalanced };
}

/** Monokai, one color per nesting level, cycling. Never yellow or orange: those are strings and variables. */
const RAINBOW = ["#F92672", "#A6E22E", "#66D9EF", "#AE81FF", "#5FD7AF", "#FF6AC1", "#7AA2F7"];

/** Everything that is not nesting, in Monokai. */
const PALETTE = {
  form: { color: "#66D9EF", fontStyle: "italic" },
  comment: { color: "#75715E", fontStyle: "italic" },
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

module.exports = { scan, RAINBOW, PALETTE, BINDERS };
