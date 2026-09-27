/**
 * A change made to code as Concepts, put back into the text it was read from, so the rest of
 * the text keeps its own layout. Code written from Concepts loses how its source was laid out
 * (lines, spacing, the parentheses it did without); rewriting a whole file for one repair
 * would replace all of it. Instead the writing before the change and the writing after it are
 * compared token by token, and each difference is made at the matching place in the original.
 *
 * For any language: tokens are words, numbers, quoted text and runs of symbols, which is how
 * every language the packs write is spelled.
 */

interface Token {
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

const TOKEN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[^\s\w]+?/g;

function tokens(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => ({ text: m[0], from: m.index, to: m.index + m[0].length }));
}

/** Pairs of indexes (i in a, j in b) of a longest common subsequence of token texts. */
function common(a: readonly Token[], b: readonly Token[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = a[i].text === b[j].text ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i].text === b[j].text) out.push([i++, j++]);
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * The original text with the change from `before` to `after` made in it, or undefined when a
 * difference falls where the original has no matching place (then the caller writes it whole).
 */
export function patchText(original: string, before: string, after: string): string | undefined {
  const o = tokens(original);
  const b = tokens(before);
  const a = tokens(after);
  if (o.length * b.length > 4_000_000 || b.length * a.length > 4_000_000) return undefined;
  // Where each token of the writing before sits in the original.
  const inOriginal = new Map<number, number>();
  for (const [bi, oi] of common(b, o)) inOriginal.set(bi, oi);
  // The differences between before and after, as runs of b removed and a put in their place.
  const kept = common(b, a);
  const hunks: { b0: number; b1: number; a0: number; a1: number }[] = [];
  let bi = 0;
  let ai = 0;
  for (const [bk, ak] of [...kept, [b.length, a.length] as [number, number]]) {
    if (bk > bi || ak > ai) hunks.push({ b0: bi, b1: bk, a0: ai, a1: ak });
    bi = bk + 1;
    ai = ak + 1;
  }
  const edits: { from: number; to: number; text: string }[] = [];
  for (const h of hunks) {
    const put = h.a1 > h.a0 ? after.slice(a[h.a0].from, a[h.a1 - 1].to) : "";
    // What is removed that the original has: writing's own parentheses and separators it
    // never had are nothing to remove.
    const removed = [];
    for (let k = h.b0; k < h.b1; k++) if (inOriginal.has(k)) removed.push(inOriginal.get(k)!);
    if (removed.length) {
      edits.push({ from: o[Math.min(...removed)].from, to: o[Math.max(...removed)].to, text: put });
      continue;
    }
    if (!put) continue;
    // Only put in: next to the token before it, or the token after it, in the original.
    const left = h.b0 > 0 ? inOriginal.get(h.b0 - 1) : undefined;
    const right = h.b1 < b.length ? inOriginal.get(h.b1) : undefined;
    if (left !== undefined) edits.push({ from: o[left].to, to: o[left].to, text: put });
    else if (right !== undefined) edits.push({ from: o[right].from, to: o[right].from, text: put });
    else return undefined;
  }
  let text = original;
  for (const e of edits.sort((x, y) => y.from - x.from)) {
    const start = text.lastIndexOf("\n", e.from - 1) + 1;
    const end = text.indexOf("\n", e.to);
    const lineEnd = end < 0 ? text.length : end;
    const rest = text.slice(0, e.from) + e.text + text.slice(e.to);
    // A line a removal leaves empty goes with it.
    const line = rest.slice(start, lineEnd - (e.to - e.from) + e.text.length);
    text = !e.text && /^\s*;?\s*$/.test(line) && end >= 0 ? text.slice(0, start) + text.slice(end + 1) : rest;
  }
  return text;
}
