// Numbers a word carries without saying them ("a pair" 2, "to and from" 2, "a week" 7), learned
// from worked solutions: a number a working uses that its question never says, counted against
// each word of the question; a word kept as carrying a number when it comes with it far more often
// than not. node scripts/learn-carried.mjs <train.jsonl> [least] [share]
import { readFileSync, writeFileSync } from "node:fs";
import { lemma } from "../dist/runtime/host.js";

const [file, least = "8", share = "0.3", out] = process.argv.slice(2);
const items = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const seen = new Map(), together = new Map(), numbers = new Map();
let total = 0;
for (const x of items) {
  const steps = [...x.answer.matchAll(/<<([^=>]+)=([^>]+)>>/g)].map((m) => ({ expr: m[1].replace(/\s+/g, ""), result: Number(m[2]) }));
  const results = new Set(steps.map((s) => s.result));
  const said = new Set((x.question.replace(/,(\d{3})/g, "$1").match(/\d*\.?\d+/g) ?? []).map(Number));
  const outside = new Set(steps.flatMap((s) => (s.expr.match(/\d*\.?\d+/g) ?? []).map(Number)).filter((v) => !results.has(v) && !said.has(v) && v !== 1 && v !== 0));
  // Words and pairs of words said beside each other ("to and from" is its words, and "and from").
  const ws = (x.question.toLowerCase().match(/[a-z]+/g) ?? []).map((w) => lemma(w) || w);
  total++;
  for (const n of outside) numbers.set(n, (numbers.get(n) ?? 0) + 1);
  const grams = new Set([...ws, ...ws.slice(1).map((w, i) => `${ws[i]} ${w}`)]);
  for (const g of grams) {
    seen.set(g, (seen.get(g) ?? 0) + 1);
    for (const n of outside) together.set(`${g}|${n}`, (together.get(`${g}|${n}`) ?? 0) + 1);
  }
}
const kept = [];
for (const [k, c] of together) {
  const [g, n] = k.split("|");
  const s = c / seen.get(g);
  // How much more often than the number comes at all.
  const lift = s / (numbers.get(Number(n)) / total);
  if (c >= Number(least) && s >= Number(share) && lift >= 3 && !g.includes(" ")) kept.push({ word: g, n: Number(n), c, of: seen.get(g), share: s, lift });
}
kept.sort((a, b) => b.lift - a.lift);
console.log(kept.map((k) => `  "${k.word}" carries ${k.n}: ${k.c} of ${k.of} (${(100 * k.share).toFixed(0)}%, ${k.lift.toFixed(1)}x)`).join("\n"));
if (out) writeFileSync(out, JSON.stringify(kept));

// Words that stand where a number would ("eight apples"), told from units ("5 minutes") by how
// seldom a number comes right before them: learned as counting as their number, the packs'
// number words forgotten, and the test situations worked with each.
const [, , , , , , testFile, nTest = "400"] = process.argv;
if (testFile) {
  const { ConceptStore } = await import("../dist/store/store.js");
  const { seed } = await import("../dist/seed/seed.js");
  const { lexicon } = await import("../dist/situation/lexicon.js");
  const { situationOf, solve } = await import("../dist/situation/situation.js");
  const after = new Map();
  for (const x of items) {
    const t = x.question.toLowerCase().match(/\d[\d,.]*|[a-z]+/g) ?? [];
    t.forEach((w, i) => {
      if (/\d/.test(w)) return;
      const l = lemma(w) || w;
      const a = after.get(l) ?? [0, 0];
      a[0]++;
      if (/\d/.test(t[i - 1] ?? "")) a[1]++;
      after.set(l, a);
    });
  }
  const best = new Map();
  for (const k of kept) if (!best.has(k.word) || best.get(k.word).lift < k.lift) best.set(k.word, k);
  const counting = [...best.values()].filter((k) => {
    const a = after.get(k.word) ?? [1, 0];
    return a[1] / a[0] < 0.1 && Number.isInteger(k.n) && k.n > 1;
  });
  console.log(`\ncounting words learned: ${counting.map((k) => `${k.word} ${k.n}`).join(", ")}`);
  const test = readFileSync(testFile, "utf8").trim().split("\n").slice(0, Number(nTest)).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
  const store = new ConceptStore();
  seed(store);
  const lex = lexicon(store);
  const score = () => test.filter((x) => { const s = situationOf(store, x.q); const g = s && s.amounts.length <= 8 ? solve(s.amounts, s.asked) : undefined; return g && Math.abs(g.value - x.want) < 1e-6; }).length;
  const withPacks = score();
  lex.forget(["CountsAs"]);
  const withNone = score();
  for (const k of counting) lex.suppose(k.word, "CountsAs", k.n);
  const withLearned = score();
  lex.unsuppose();
  lex.forget([]);
  console.log(`test (${test.length}): the packs' number words ${withPacks}, none ${withNone}, learned ${withLearned}`);
}
