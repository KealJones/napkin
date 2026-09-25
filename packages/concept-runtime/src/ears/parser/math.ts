/**
 * Arithmetic written in symbols, read before any grammar.
 *
 * "(2 + 3) * 4" is not English, and the tagger treats it as punctuation: "*" vanished,
 * "(10)" became a stray token and "2^8" became `28()`. A span of numbers, operators and
 * parentheses is parsed here by precedence and put back as one verbatim token, so the
 * grammar only sees a thing: "what is (2 + 3) * 4" is What(Is(Times(Plus(2, 3), 4))).
 *
 * The names are the words the operators are read aloud as, the way "5 times 3" is
 * Times(5, 3); the graph realizes them (Times is a synonym of Multiply).
 */
import { type Expr, c } from "../../concept/expression.js";

const BINARY: Record<string, { name: string; prec: number; right?: true }> = {
  "=": { name: "Equals", prec: 1 },
  "<": { name: "LessThan", prec: 1 },
  ">": { name: "GreaterThan", prec: 1 },
  "<=": { name: "AtMost", prec: 1 },
  ">=": { name: "AtLeast", prec: 1 },
  "+": { name: "Plus", prec: 2 },
  "-": { name: "Minus", prec: 2 },
  "*": { name: "Times", prec: 3 },
  "×": { name: "Times", prec: 3 },
  "·": { name: "Times", prec: 3 },
  x: { name: "Times", prec: 3 },
  "/": { name: "Over", prec: 3 },
  "÷": { name: "Over", prec: 3 },
  "%": { name: "Mod", prec: 3 },
  mod: { name: "Mod", prec: 3 },
  "^": { name: "Power", prec: 5, right: true },
  "**": { name: "Power", prec: 5, right: true },
};
/**
 * Number words next to an operator are numbers in the sum, read as the Ears reads them,
 * Number("one"): "what is one + 2". Only beside a symbol, so "one of them" stays words.
 */
const NUMBER_WORDS = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million";
const OPERATOR = "[-+*/×÷·^%=<>]";

/** Unary minus binds tighter than * and looser than ^: -2^2 is -(2^2). */
const NEGATE = 4;

type Token = { kind: "num"; value: Expr } | { kind: "op"; op: string } | { kind: "open" } | { kind: "close" };

function tokenize(src: string): Token[] | undefined {
  const out: Token[] = [];
  const re = new RegExp(`\\s*(\\d+(?:\\.\\d+)?|(?:${NUMBER_WORDS})\\b|\\*\\*|<=|>=|mod\\b|[-+*/×÷·^%=<>()]|x(?=\\s*[\\d(]))`, "iy");
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) return /^\s*$/.test(src.slice(at)) ? out : undefined;
    at = re.lastIndex;
    const t = m[1];
    if (/^\d/.test(t)) out.push({ kind: "num", value: Number(t) });
    else if (/^[a-z]/i.test(t) && t !== "x" && t.toLowerCase() !== "mod") out.push({ kind: "num", value: c("Number", t) });
    else if (t === "(") out.push({ kind: "open" });
    else if (t === ")") out.push({ kind: "close" });
    else out.push({ kind: "op", op: t });
  }
  return out;
}

/** The expression the tokens spell, or undefined when they do not spell one. */
function parse(tokens: Token[]): Expr | undefined {
  let i = 0;
  const peek = () => tokens[i];
  const operand = (): Expr => {
    const t = tokens[i++];
    if (!t) throw new Error("end");
    if (t.kind === "num") return t.value;
    if (t.kind === "open") {
      const inner = expression(0);
      if (peek()?.kind !== "close") throw new Error("unclosed");
      i += 1;
      return inner;
    }
    if (t.kind === "op" && t.op === "-") {
      const next = peek();
      // "-3" is a number; "-(2 + 3)" and "-x^2" negate what follows.
      if (next?.kind === "num" && typeof next.value === "number" && !(tokens[i + 1]?.kind === "op" && BINARY[(tokens[i + 1] as { op: string }).op]?.prec > NEGATE)) {
        i += 1;
        return -next.value;
      }
      return c("Negative", expression(NEGATE));
    }
    throw new Error("operand");
  };
  const expression = (min: number): Expr => {
    let left = operand();
    for (;;) {
      const t = peek();
      // "2(3 + 4)": a number or a closing parenthesis against an opening one multiplies.
      if (t?.kind === "open" && min <= 3) {
        left = c("Times", left, operand());
        continue;
      }
      if (t?.kind !== "op") return left;
      const op = BINARY[t.op];
      if (!op || op.prec < min) return left;
      i += 1;
      left = c(op.name, left, expression(op.right ? op.prec : op.prec + 1));
    }
  };
  try {
    const e = expression(0);
    return i === tokens.length ? e : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read an arithmetic span, or undefined when it is not one. A run with an operator in it is
 * arithmetic; one whose only operators are an unspaced "-" or "/" is a date, a phone number,
 * a range or "24/7", and is left as written.
 */
export function readMath(span: string): Expr | undefined {
  const tokens = tokenize(span);
  if (!tokens) return undefined;
  const ops = tokens.filter((t) => t.kind === "op");
  if (!ops.length && !tokens.some((t) => t.kind === "open")) return undefined;
  if (tokens.length < 3) return undefined;
  const loose = ops.every((t) => t.kind === "op" && (t.op === "-" || t.op === "/"));
  if (loose && !/\s[-/]\s/.test(span) && !span.includes("(")) return undefined;
  return parse(tokens);
}

/** Replace each arithmetic span in the text with what `keep` makes of its expression. */
export function mathSpans(text: string, keep: (e: Expr) => string): string {
  // A span starts at a number, a parenthesis or a minus before one, and runs over the
  // characters arithmetic is written in. Letters stop it, except "x" and "mod" between numbers.
  const word = `(?:${NUMBER_WORDS})\\b`;
  const span = new RegExp(
    `(?<![\\w.$#@/])(?:[-(]\\s*)*(?:\\d|${word}(?=\\s*${OPERATOR}))(?:[\\d.\\s()+\\-*/×÷·^%=<>]|(?<=${OPERATOR}\\s*)${word}|x(?=\\s*[\\d(])|mod(?=\\s))*`,
    "gi",
  );
  return text.replace(span, (whole) => {
    // Trailing spaces, sentence punctuation and a dangling operator belong to the sentence.
    let s = whole.replace(/[\s.]+$/, "");
    while (/[-+*/×÷·^%=<>(]\s*$/.test(s)) s = s.replace(/[-+*/×÷·^%=<>(]\s*$/, "").replace(/\s+$/, "");
    // An unmatched ")" at the end is the sentence's, not the sum's: "(like 2 + 2)".
    while ((s.match(/\)/g) ?? []).length > (s.match(/\(/g) ?? []).length && s.endsWith(")")) s = s.slice(0, -1).replace(/\s+$/, "");
    while ((s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length && /^\(\s*/.test(s)) s = s.replace(/^\(\s*/, "");
    // A phone number, "24/7" or "3-4" is not arithmetic, and not words either: kept as typed.
    const e = readMath(s) ?? (/^\d[\d.]*(?:[-/]\d[\d.]*)+$/.test(s) ? s : undefined);
    if (e === undefined) return whole;
    const lead = whole.slice(0, whole.indexOf(s));
    return lead + keep(e) + whole.slice(whole.indexOf(s) + s.length);
  });
}
