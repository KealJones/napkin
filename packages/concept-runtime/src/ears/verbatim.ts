/**
 * What in a message is kept as typed rather than heard: code (fenced, indented, backticked, or
 * pasted as a call), links and quotes, each cut out as one token for hearing to take as one
 * thing (code-reading.ts reads the code as Concepts).
 */
import { type Expr, c } from "../concept/expression.js";

/**
 * Code pasted without backticks, "ItIs(Imperative(You()))": a capitalised head directly
 * followed by "(" opens a call, which runs to its balancing ")" or, left unbalanced, to the
 * last ")" on the line. It is kept as inline code, exactly as typed.
 */
function bareCode(text: string, keep: (code: string) => string): string {
  let out = "";
  let i = 0;
  const head = /\b[A-Z][A-Za-z0-9]*\(/g;
  for (let m = head.exec(text); m; m = head.exec(text)) {
    if (m.index < i) continue;
    let depth = 0;
    let end = -1;
    let lastClose = -1;
    for (let j = m.index + m[0].length - 1; j < text.length && text[j] !== "\n"; j += 1) {
      if (text[j] === "(") depth += 1;
      else if (text[j] === ")") {
        depth -= 1;
        lastClose = j;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) end = lastClose + 1;
    if (end <= 0) continue;
    out += text.slice(i, m.index) + keep(text.slice(m.index, end));
    i = end;
    head.lastIndex = end;
  }
  return out + text.slice(i);
}

/**
 * What in a message is not words to hear but text to keep as typed: fenced blocks, lines of
 * code, backticked code, code pasted as a call ("Foo(Bar())"), links and quotes. Each is
 * cut out as one token, `verbatim0`, and returned in `spans` as the Concept it reads as
 * (Block, InlineCode, or the text itself), so hearing takes it as one thing.
 */
export function verbatimSpans(message: string): { text: string; spans: Expr[]; tentative: Map<number, string> } {
  const found: Expr[] = [];
  // Kept as code only if some language reads it: "here is my plan:" over indented steps is
  // prose shaped like Python. The caller puts these back as words when nothing reads them.
  const tentative = new Map<number, string>();
  const keep = (e: Expr) => ` verbatim${found.push(e) - 1} `;
  // A fence may open anywhere on a line ("here's mine ```python").
  let text = message.replace(/(`{3,})([\w+-]*)[ \t]*\n([\s\S]*?)\n?\1/g, (_m, _f, lang: string, body: string) =>
    keep(lang ? c("Block", lang, body) : c("Block", body)),
  );
  // Backticks around several lines hold a block, before any line is judged on its own; around
  // one line, inline code, before the line around it is judged ("whats wrong with `if (x = 5)`").
  text = text.replace(/`([^`]*\n[^`]*)`/g, (_m, code: string) => keep(c("Block", code)));
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => keep(c("InlineCode", code)));
  // Arithmetic written in symbols with grouping or powers ("(2+3)*4", "2^10", "3/4") is one
  // thing, the sum it writes (code-reading.ts reads it as the code IR's arithmetic).
  text = text.replace(/(^|[\s=:(])((?:[-(]\s*)*\d+(?:\.\d+)?(?:\s*[)]*\s*[-+*/^×÷]\s*[(\s]*-?\d+(?:\.\d+)?\s*[)]*)+)(?=$|[\s?.!,])/g, (m, before: string, sum: string) =>
    /[()^/÷]|[-+*×].*[-+*×]/.test(sum) && (sum.match(/\(/g) ?? []).length === (sum.match(/\)/g) ?? []).length ? before + keep(c("Arithmetic", sum.trim())) : m,
  );
  // A path to a file ("src/code/tree.ts", "./notes.md", "~/x.py") is the file, one thing.
  text = text.replace(/(^|[\s(])((?:~|\.{1,2})?\/?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,6}|(?:~|\.{1,2})\/[\w.-]+\.[A-Za-z0-9]{1,6})(?=$|[\s),.!?:;])/g, (_m, before: string, path: string) => before + keep(c("File", path)));
  // Lines that are code by their form: they end the way statements do, or open a block, or
  // are mostly the symbols code is written in. Consecutive ones are one block.
  const codeLine = (line: string): boolean => {
    const t = line.trim();
    if (t.length < 3 || /^verbatim\d+$/.test(t)) return false;
    const symbols = (t.match(/[{}()[\];=<>]/g) ?? []).length;
    return /[;{}]$/.test(t) || /=>|===|!==|::|->/.test(t) || symbols / t.length > 0.15;
  };
  const lines = text.split("\n");
  const closer = (line: string) => /^\s*[}\])]+[;,]?\s*$/.test(line);
  // Inside a line of prose, the code is the stretch from its first symbol (or the name being
  // assigned, "const x =") to its last: "why does const x = f(y); fail".
  const within = (line: string): string => {
    const words = line.split(/(\s+)/);
    const symbolic = (w: string) => /[{}()[\];=<>*+]/.test(w);
    const at = words.map((w, i) => (symbolic(w) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) return line;
    let first = at[0];
    if (words[first] === "=" || words[first].startsWith("=")) first = Math.max(0, first - 4);
    const last = at[at.length - 1];
    const code = words.slice(first, last + 1).join("").trim();
    return code.length > 2 ? words.slice(0, first).join("") + keep(c("InlineCode", code)) + words.slice(last + 1).join("") : line;
  };
  // An indented block under a line ending in ":" is code too (Python): "for a in items:".
  const indent = (line: string) => line.length - line.trimStart().length;
  const opensBlock = (i: number) => /:\s*$/.test(lines[i]) && i + 1 < lines.length && indent(lines[i + 1]) > indent(lines[i]) && lines[i + 1].trim() !== "";
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (opensBlock(i)) {
      let j = i + 1;
      while (j < lines.length && (indent(lines[j]) > indent(lines[i]) || (lines[j].trim() === "" && j + 1 < lines.length && indent(lines[j + 1]) > indent(lines[i])))) j += 1;
      const body = lines.slice(i, j).join("\n");
      tentative.set(found.length, body);
      out.push(keep(c("Block", body)));
      i = j;
      continue;
    }
    if (!codeLine(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    let j = i;
    while (j < lines.length && (codeLine(lines[j]) || closer(lines[j]) || (lines[j].trim() === "" && j + 1 < lines.length && codeLine(lines[j + 1])))) j += 1;
    out.push(j - i > 1 ? keep(c("Block", lines.slice(i, j).join("\n"))) : within(lines[i]));
    i = j;
  }
  text = out.join("\n");
  text = bareCode(text, (code) => keep(c("InlineCode", code)))
    .replace(/https?:\/\/[^\s)]+[^\s).,!?]/g, (url) => keep(url))
    .replace(/"([^"\n]+)"/g, (_m, q: string) => keep(q));
  return { text, spans: found, tentative };
}
