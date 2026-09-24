/**
 * The .ncon layout: what the runtime writes a pack as. The editor's Format Document loads
 * this build (editors/vscode-ncon/format.js), so the two cannot drift. Text to text, so
 * comments and blank lines between forms survive.
 *
 * - `name = value`, with a space either side of `=`.
 * - A call stays on one line when it fits in 120 columns and every call inside it has at most
 *   two arguments, or is short (60 columns or less).
 * - Otherwise each argument goes on its own line, two spaces in, and the closing parenthesis
 *   on its own line under the start of the call. `Concept`, `Realization`, `Lambda` and `Bind`
 *   keep their first argument on the line they start: `Bind($found,`.
 * - Comments stay above the argument they precede, at the end of the line they trailed, or
 *   before the closing parenthesis they came before.
 * - Raw strings (`"""..."""`) are kept exactly as written.
 * - Between top-level forms, blank lines are kept, at most one in a row.
 * - A journal, whose first form is `Journal(...)`, is left as written: one change per line.
 */

const WIDTH = 120;
const SHORT = 60;

interface Comment {
  text: string;
  blankBefore: boolean;
}
interface Atom {
  kind: "atom";
  text: string;
}
interface Call {
  kind: "call";
  head: string;
  args: Arg[];
  dangling: Comment[];
}
type Node = Atom | Call;
interface Arg {
  name?: string;
  value: Node;
  leading: Comment[];
  trailing?: Comment;
}
interface Item {
  leading: Comment[];
  blankBefore: boolean;
  value: Node;
}

export class FormatError extends Error {}

function parse(text: string): { items: Item[]; trailing: Comment[] } {
  let i = 0;
  const n = text.length;
  const fail = (why: string): never => {
    const line = text.slice(0, i).split("\n").length;
    throw new FormatError(`${why} at line ${line}`);
  };

  /**
   * Whitespace and comments up to the next token. A comment on the line where the previous
   * token ended is marked, so it can stay a trailing comment.
   */
  const skip = (): { comments: (Comment & { sameLine: boolean })[]; blankAfter: boolean } => {
    const comments: (Comment & { sameLine: boolean })[] = [];
    let newlines = 0;
    while (i < n) {
      const ch = text[i];
      if (ch === "\n") {
        newlines++;
        i++;
      } else if (ch === " " || ch === "\t" || ch === "\r") i++;
      else if (ch === "/" && text[i + 1] === "/") {
        const end = text.indexOf("\n", i);
        const stop = end < 0 ? n : end;
        comments.push({ text: text.slice(i, stop).trimEnd(), blankBefore: newlines > 1, sameLine: newlines === 0 });
        newlines = 0;
        i = stop;
      } else break;
    }
    return { comments, blankAfter: newlines > 1 };
  };

  const value = (): Node => {
    const ch = text[i];
    if (text.startsWith('"""', i)) {
      const end = text.indexOf('"""', i + 3);
      if (end < 0) fail("Unterminated raw string");
      const atom: Atom = { kind: "atom", text: text.slice(i, end + 3) };
      i = end + 3;
      return atom;
    }
    if (ch === '"') {
      const start = i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === "\n") fail("Unterminated string");
        i += text[i] === "\\" ? 2 : 1;
      }
      i++;
      return { kind: "atom", text: text.slice(start, i) };
    }
    if (ch === "$" || ch === "-" || /[0-9]/.test(ch ?? "")) {
      const m = /^(\$[A-Za-z_][A-Za-z0-9_]*|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i));
      if (!m) return fail(`Unexpected ${JSON.stringify(ch)}`);
      i += m[0].length;
      return { kind: "atom", text: m[0] };
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (!m) return fail(`Unexpected ${JSON.stringify(ch ?? "end of input")}`);
    i += m[0].length;
    let k = i;
    while (k < n && (text[k] === " " || text[k] === "\t")) k++;
    if (text[k] !== "(") return { kind: "atom", text: m[0] };
    i = k + 1;
    return call(m[0]);
  };

  const call = (head: string): Call => {
    const args: Arg[] = [];
    let { comments } = skip();
    if (text[i] === ")") {
      i++;
      return { kind: "call", head, args, dangling: comments };
    }
    for (;;) {
      // An argument, its comments above it, and an optional name.
      const leading = comments.map(({ text, blankBefore }) => ({ text, blankBefore }));
      let name: string | undefined;
      const named = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(text.slice(i));
      if (named) {
        name = named[1];
        i += named[0].length;
        const between = skip();
        leading.push(...between.comments);
      }
      const arg: Arg = { name, value: value(), leading };
      args.push(arg);
      let after = skip();
      if (text[i] === ",") {
        i++;
        after = skip();
        // A comment on the line the comma ended trails this argument.
        if (after.comments[0]?.sameLine) {
          const [first, ...rest] = after.comments;
          arg.trailing = { text: first.text, blankBefore: false };
          after = { comments: rest, blankAfter: after.blankAfter };
        }
        if (text[i] === ")") fail("A trailing comma before ')'");
        comments = after.comments;
        continue;
      }
      if (text[i] === ")") {
        i++;
        const [first, ...rest] = after.comments;
        if (first?.sameLine) {
          arg.trailing = { text: first.text, blankBefore: false };
          return { kind: "call", head, args, dangling: rest };
        }
        return { kind: "call", head, args, dangling: after.comments };
      }
      return fail("Expected ',' or ')'");
    }
  };

  const items: Item[] = [];
  let pending = skip();
  let blank = false;
  while (i < n) {
    const first = pending.comments[0];
    items.push({ leading: pending.comments, blankBefore: blank || !!first?.blankBefore, value: value() });
    pending = skip();
    // A trailing comment on the last line of a form stays with it.
    blank = pending.blankAfter && !pending.comments.length;
  }
  return { items, trailing: pending.comments };
}

/* ------------------------------------------------------------------ *
 * Printing.
 * ------------------------------------------------------------------ */

const hasComments = (node: Node): boolean =>
  node.kind === "call" && (node.dangling.length > 0 || node.args.some((a) => a.leading.length || a.trailing || hasComments(a.value)));

const multiline = (node: Node): boolean => (node.kind === "atom" ? node.text.includes("\n") : node.args.some((a) => multiline(a.value)));

const flat = (node: Node): string =>
  node.kind === "atom" ? node.text : `${node.head}(${node.args.map((a) => (a.name ? `${a.name} = ` : "") + flat(a.value)).join(", ")})`;

/** Every call inside has at most two arguments, or is short. */
const calm = (node: Node): boolean => node.kind === "atom" || ((node.args.length <= 2 || flat(node).length <= SHORT) && node.args.every((a) => calm(a.value)));

const pad = (n: number): string => " ".repeat(n);

/** Calls whose first argument says what the rest is about, and stays beside the head. */
const HUG = new Set(["Concept", "Realization", "Lambda", "Bind"]);

/** A node printed at `column` on a line indented by `indent`. */
function print(node: Node, indent: number, column: number): string {
  if (node.kind === "atom") return node.text;
  const one = flat(node);
  if (!hasComments(node) && !multiline(node) && calm(node) && column + one.length <= WIDTH) return one;
  if (!node.args.length) {
    return `${node.head}(\n${node.dangling.map((c) => pad(indent + 2) + c.text).join("\n")}\n${pad(indent)})`;
  }
  const inner = indent + 2;
  const lines: string[] = [];
  const first = node.args[0];
  const hug =
    HUG.has(node.head) && node.args.length > 1 && !first.name && !first.leading.length && !first.trailing &&
    !hasComments(first.value) && !multiline(first.value) && column + node.head.length + 2 + flat(first.value).length <= WIDTH;
  node.args.forEach((a, k) => {
    if (hug && k === 0) return;
    for (const c of a.leading) {
      if (c.blankBefore && lines.length) lines.push("");
      lines.push(pad(inner) + c.text);
    }
    const prefix = a.name ? `${a.name} = ` : "";
    const comma = k < node.args.length - 1 ? "," : "";
    const trailing = a.trailing ? ` ${a.trailing.text}` : "";
    lines.push(pad(inner) + prefix + print(a.value, inner, inner + prefix.length) + comma + trailing);
  });
  for (const c of node.dangling) {
    if (c.blankBefore) lines.push("");
    lines.push(pad(inner) + c.text);
  }
  const head = hug ? `${node.head}(${flat(first.value)},` : `${node.head}(`;
  return `${head}\n${lines.join("\n")}\n${pad(indent)})`;
}

/** A pack's text, formatted. */
export function formatNcon(text: string): string {
  // A journal (store/journal.ts) is one change per line, machine-written: left as it is.
  if (/^\s*(?:\/\/[^\n]*\n\s*)*Journal\(/.test(text)) return text;
  const { items, trailing } = parse(text);
  const out: string[] = [];
  items.forEach((item, k) => {
    if (k > 0 && item.blankBefore) out.push("");
    item.leading.forEach((c, j) => {
      if (j > 0 && c.blankBefore) out.push("");
      out.push(c.text);
    });
    out.push(print(item.value, 0, 0));
  });
  if (trailing.length) {
    if (trailing[0].blankBefore) out.push("");
    out.push(...trailing.map((c) => c.text));
  }
  return out.join("\n") + "\n";
}
