/**
 * The line form, and lifting it to an expression (ir-spec Part 9.2).
 *
 * The producer writes one line per phrase, either a plain expression or `$name = expr`.
 * One line lifts to itself; N lines lift to Sequence(...). The producer therefore never
 * writes Sequence, never writes a root wrapper, and never has to close an outer paren —
 * which was the only hard failure measured on a 4B.
 *
 * Lines also give fault isolation: one malformed line is one malformed clause, and the
 * others still parse.
 */
import { type Expr, c, call, parse, v } from "../concept/expression.js";

export interface Lifted {
  readonly expression: Expr | undefined;
  readonly clauses: number;
  readonly rejected: { line: string; reason: string }[];
}

const ASSIGNMENT = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;

/** Append missing close parens. The measured failure was always short, never long. */
export function balance(text: string): string {
  let open = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "(") open += 1;
    else if (ch === ")") open -= 1;
  }
  if (open > 0) return text + ")".repeat(open);
  if (open < 0) return text.slice(0, open);
  return text;
}

/**
 * Single-quoted strings are not in the grammar, but a small model writes them anyway.
 * Converting is unambiguous when the line contains no double quotes at all.
 */
export function doubleQuotes(text: string): string {
  if (text.includes('"')) return text;
  return text.replace(/'([^']*)'/g, (_, inner: string) => JSON.stringify(inner));
}

/**
 * `?` is not in the grammar at any position, so a bare one can only ever be a model
 * writing a placeholder for an unknown. That is exactly what `$_` means, and the rewrite
 * is unambiguous precisely because `?` is otherwise illegal.
 *
 * Measured live: `What(Multiply(?, ?))` was rejected outright, the clause was dropped, and
 * the turn answered the half of the sentence that survived.
 */
export function placeholders(text: string): string {
  if (!text.includes("?")) return text;
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (!inString && ch === "?") { out += "$_"; continue; }
    out += ch;
  }
  return out;
}

/**
 * Last resort for output that was cut off mid-token by a generation cap. A model that
 * runs away -- a 27B listing SynonymOf for a thousand tokens -- produces a prefix that is
 * perfectly good up to the cut and unparseable after it. Trimming back to the last
 * complete argument keeps what it managed to say.
 *
 * Deliberately last: it discards content, so anything that parses outright must win.
 */
export function salvage(text: string): string {
  let candidate = text;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const cut = candidate.lastIndexOf(",");
    if (cut <= 0) return text;
    candidate = candidate.slice(0, cut);
    const balanced = balance(candidate);
    try {
      parse(balanced);
      return balanced;
    } catch {
      // Still inside a broken argument. Keep trimming.
    }
  }
  return text;
}

/** Outside strings, apply a text rewrite. */
function outsideStrings(text: string, rewrite: (chunk: string) => string): string {
  return text.split(/("(?:[^"\\]|\\.)*")/).map((part, i) => (i % 2 ? part : rewrite(part))).join("");
}

/** `3()` is the model writing a digit as a call: it is 3. */
export const digitCalls = (l: string): string => outsideStrings(l, (c) => c.replace(/\b(\d+)\(\)/g, "$1"));

/**
 * Two calls side by side with no comma, `The(Heater()) Is(Broken())`, is two arguments with
 * the comma forgotten. Inside a call the comma goes back; at the top level it is two lines,
 * split by `lift`.
 */
export const missingCommas = (l: string): string => outsideStrings(l, (c) => c.replace(/\)\s+(?=[A-Z$"\d])/g, "), "));

/** Repairs to try, in order, before giving up on a line (ir-spec Part 12, item 6). */
export const repairs: ((line: string) => string)[] = [
  (l) => l,
  digitCalls,
  (l) => balance(missingCommas(digitCalls(l))),
  balance,
  doubleQuotes,
  placeholders,
  (l) => balance(doubleQuotes(l)),
  (l) => balance(doubleQuotes(placeholders(l))),
  (l) => balance(doubleQuotes(placeholders(l.replace(/,\s*\)/g, ")")))),
  (l) => salvage(doubleQuotes(placeholders(l))),
];

export function stripFence(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```[a-z]*\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

export function lift(text: string): Lifted {
  const lines = stripFence(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const clauses: Expr[] = [];
  const rejected: { line: string; reason: string }[] = [];

  for (const line of lines.flatMap(splitTopLevel)) {
    const assignment = ASSIGNMENT.exec(line);
    const body = assignment ? assignment[2] : line;
    let value: Expr | undefined;
    let reason = "";
    for (const repair of repairs) {
      try {
        value = parse(repair(body));
        break;
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
      }
    }
    if (value === undefined) {
      rejected.push({ line, reason });
      continue;
    }
    value = nameRefs(value);
    // `$x = expr` becomes a binding scoping over everything after it, built up below.
    clauses.push(assignment ? c("Let", v(assignment[1]), value) : value);
  }

  if (!clauses.length) return { expression: undefined, clauses: 0, rejected };
  return { expression: scope(clauses), clauses: clauses.length, rejected };
}

/**
 * The Ears writes a reference inside the message positionally, `Ref("it", $pr)`, because
 * named arguments are forbidden to it (`ir-spec.md` Part 9.3). The IR names that argument
 * `resolvedTo`, the same slot memory fills when it resolves a reference from history
 * (`memory-spec.md` Part 5.2). Naming it is mechanical and loses nothing.
 */
function nameRefs(e: Expr): Expr {
  if (typeof e !== "object" || e === null || !("head" in e)) return e;
  const args = e.args.map((a) => ({ ...a, value: nameRefs(a.value) }));
  if (e.head === "Ref" && args.length === 2 && args.every((a) => a.name === undefined)) {
    return call("Ref", [args[0], { name: "resolvedTo", value: args[1].value }]);
  }
  return call(e.head, args);
}

/**
 * A binding is live for everything after it, in order (concept-spec Part 5.2). Flat lines
 * are surface sugar; nested scope is the core, and the lift is mechanical.
 */
function scope(clauses: Expr[]): Expr {
  const [first, ...rest] = clauses;
  const isBinding = typeof first === "object" && first !== null && "head" in first && first.head === "Let" && first.args.length === 2;

  if (!rest.length) return isBinding ? (first.args[1].value as Expr) : first;
  if (isBinding) {
    return call("Let", [
      { value: first.args[0].value },
      { value: first.args[1].value },
      { value: scope(rest) },
    ]);
  }
  const tail = scope(rest);
  const steps = typeof tail === "object" && tail !== null && "head" in tail && tail.head === "Sequence"
    ? tail.args.map((a) => a.value)
    : [tail];
  return c("Sequence", first, ...steps);
}

const NUMBER_WORD =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|dozen)\b/i;

const VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
};

/**
 * Mechanical repairs to `Number(...)`, which the IR reserves for a number the message
 * spelled as a word (`ir-spec.md` Part 9.7). Three slips, each unambiguous:
 *
 *  - `Number("10")`: digits in a string are the number 10.
 *  - `Number("ten")` when the message wrote 10 and never "ten": the digit comes back.
 *  - `Number("double")`: not a number word, so it is its own name, `Double()`.
 *  - `Five()` when the message wrote 5 and never "five": the digit comes back.
 *
 * Measured on the eval before this existed: each appeared in several cases, and prompt
 * rules against them did not hold (`novel-prompt-findings.md` Part 7). Rules in the prompt
 * are the wrong place for a mechanical fix (`AGENTS.md`).
 */
export function mendNumbers(e: Expr, message: string): Expr {
  if (typeof e !== "object" || e === null || !("head" in e)) return e;
  // A number word as a Concept, Five(), for a digit the message typed: the digit comes back.
  const spelled = VALUES[e.head.toLowerCase()];
  if (spelled !== undefined && e.args.length === 0 && !new RegExp(`\\b${e.head}\\b`, "i").test(message) &&
      new RegExp(`(^|[^\\d])${spelled}([^\\d]|$)`).test(message)) return spelled;
  const [only] = e.args;
  if (e.head === "Number" && e.args.length === 1 && typeof only.value === "string") {
    const text = only.value.trim();
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    const value = VALUES[text.toLowerCase()];
    const said = new RegExp(`\\b${text}\\b`, "i").test(message);
    if (value !== undefined && !said && new RegExp(`(^|[^\\d])${value}([^\\d]|$)`).test(message)) return value;
    if (!NUMBER_WORD.test(text) && /^[a-z]+$/i.test(text)) return c(text[0].toUpperCase() + text.slice(1).toLowerCase());
  }
  return call(e.head, e.args.map((a) => ({ ...a, value: mendNumbers(a.value, message) })));
}

/**
 * Articles carry no content in a reading (`reading-spec.md`, R12), and a small model writes
 * them as calls however the prompt asks: "a typescript function" came back as
 * `A(Typescript(Function()))` in every sample. So they come off mechanically: `A(x)` is `x`,
 * and a bare `A()` or `The()` among arguments is dropped. Only for an article the message
 * actually has, in lower case, so the option letter in "A. Sept 20" survives.
 */
export function dropArticles(e: Expr, message: string): Expr {
  const said = new Set((message.match(/\b(a|an|the)\b/g) ?? []).map((w) => w[0].toUpperCase() + w.slice(1)));
  if (!said.size) return e;
  const isArticle = (x: Expr) => typeof x === "object" && x !== null && "head" in x && said.has(x.head);
  const walk = (x: Expr): Expr => {
    if (typeof x !== "object" || x === null || !("head" in x)) return x;
    if (isArticle(x) && x.args.length === 1 && x.args[0].name === undefined) return walk(x.args[0].value);
    // An article around several things stands for none of them: its arguments take its place.
    const args = x.args.flatMap((a) =>
      isArticle(a.value) && a.name === undefined && "args" in (a.value as object)
        ? (a.value as { args: typeof x.args }).args.map((b) => ({ ...b, value: walk(b.value) }))
        : [{ ...a, value: walk(a.value) }],
    );
    return call(x.head, args);
  };
  return walk(e);
}

const POINTING = new Set(["Him", "Her", "Them", "This", "That", "These", "Those"]);
const RENAMED: Record<string, string> = { Dont: "DoNot", Which: "WhichOf" };

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const here = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = here;
    }
  }
  return row[b.length];
}

/**
 * Surface slips a small model makes however it is prompted, repaired against the message:
 *
 *  - a bare pointing word, `Him()` or `These()`, is `Ref("him")`: it points, it names nothing;
 *  - `Dont` and `Which` are spelled `DoNot` and `WhichOf`;
 *  - a name the message never said but is one or two letters off a word it did say is the
 *    model's typo, and gets the user's word back: `Empphasis` for "emphasis", `Had` for
 *    "head". A name that merely inflects a word (`Visited` for "visit") is left alone.
 *
 * `It()` is not a pointing word here: in "what time is it" it points at nothing.
 */
export function mendWords(e: Expr, message: string): Expr {
  const said = [...new Set((message.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3))];
  const saidSet = new Set(message.toLowerCase().match(/[a-z]+/g) ?? []);
  const restore = (head: string): string => {
    if (!/^[A-Z][a-z]+$/.test(head)) return head;
    const w = head.toLowerCase();
    if (saidSet.has(w) || w.length < 3) return head;
    if (said.some((s) => s.slice(0, 4) === w.slice(0, 4) || w.startsWith(s) || s.startsWith(w))) return head;
    const near = said.filter((s) => Math.abs(s.length - w.length) <= 2 && distance(s, w) <= (w.length >= 6 ? 2 : 1));
    return near.length === 1 ? near[0][0].toUpperCase() + near[0].slice(1) : head;
  };
  const walk = (x: Expr): Expr => {
    if (typeof x !== "object" || x === null || !("head" in x)) return x;
    if (POINTING.has(x.head) && saidSet.has(x.head.toLowerCase())) {
      const ref = call("Ref", [{ value: x.head.toLowerCase() }]);
      if (x.args.length === 0) return ref;
      // A pointing word never heads (reading-spec): "that was wrong" is Was(Ref("that"), Wrong()).
      const [only] = x.args;
      if (x.args.length === 1 && only.name === undefined && typeof only.value === "object" && only.value !== null && "head" in only.value) {
        const pred = only.value;
        return walk(call(pred.head, [{ value: ref }, ...pred.args]));
      }
    }
    // "the same thing", "the usual", folded into one name or wrapped in The: a pointing phrase.
    const phrase = /^The([A-Z][a-z]+)((?:[A-Z][a-z]+)*)$/.exec(x.head);
    if (phrase && x.args.length === 0 && /^(Same|Other|Usual|Last|Previous|First|Second|Next)$/.test(phrase[1])) {
      return call("Ref", [{ value: ("the " + (phrase[1] + phrase[2]).replace(/([a-z])([A-Z])/g, "$1 $2")).toLowerCase() }]);
    }
    if (x.head === "The" && x.args.length === 1) {
      const inner = x.args[0].value;
      if (typeof inner === "object" && inner !== null && "head" in inner && inner.args.length === 0 &&
          /^(Same|Other|Usual|Last|Previous|Rest|Former|Latter)$/.test(restore(inner.head))) {
        return call("Ref", [{ value: "the " + restore(inner.head).toLowerCase() }]);
      }
    }
    if (x.head === "Ref" && x.args.length === 1 && typeof x.args[0].value === "string") {
      const mended = mendRef(x.args[0].value);
      if (mended !== undefined) return mended;
    }
    // "i" is Me(): I() and I(Me()) are the model spelling it twice.
    if (x.head === "I" && saidSet.has("i")) {
      if (x.args.length === 0) return call("Me", []);
      const [only] = x.args;
      if (x.args.length === 1 && typeof only.value === "object" && only.value !== null && "head" in only.value && only.value.head === "Me") return walk(only.value);
    }
    const head = RENAMED[x.head] ?? restore(x.head);
    const isBareArticle = (v: Expr) =>
      typeof v === "object" && v !== null && "head" in v && v.head === "Ref" && v.args.length === 1 &&
      typeof v.args[0].value === "string" && /^(a|an|the)$/i.test(v.args[0].value.trim());
    // An all-digit string the user never quoted is a number: Pr("482") for "PR #482".
    const unquote = (v: Expr): Expr =>
      typeof v === "string" && /^\d+$/.test(v) && !message.includes(`"${v}"`) ? Number(v) : v;
    return call(head, x.args.filter((a) => !isBareArticle(a.value)).map((a) => ({ ...a, value: unquote(walk(a.value)) })));
  };
  return walk(e);
}

const POINTS = /\b(it|its|this|that|these|those|him|her|them|they|he|she|one|ones|other|same|previous|last|usual|before|earlier|above|below|former|latter|there|then)\b/i;

/**
 * A `Ref` the model wrote for something that does not point: digits are a number, a bare
 * article is nothing, "a mouse" introduces a new thing and names it, and a phrase with no
 * pointing word in it is the user's own text. Undefined when the Ref really points.
 */
function mendRef(text: string): Expr | null | undefined {
  const t = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^(a|an|the)$/i.test(t)) return null;
  const indefinite = /^(a|an)\s+([a-z]+)$/i.exec(t);
  if (indefinite) return call(indefinite[2][0].toUpperCase() + indefinite[2].slice(1).toLowerCase(), []);
  if (POINTS.test(t)) return undefined;
  return t;
}

/** A line holding several top-level calls side by side is several lines. */
export function splitTopLevel(line: string): string[] {
  if (ASSIGNMENT.test(line)) return [line];
  const parts: string[] = [];
  let depth = 0, inString = false, escaped = false, start = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        const rest = line.slice(i + 1);
        if (/^\s+[A-Z]/.test(rest)) { parts.push(line.slice(start, i + 1).trim()); start = i + 1; }
      }
    }
  }
  parts.push(line.slice(start).trim());
  return parts.filter(Boolean);
}
