// Learning what words do from worked solutions (src/situation/worked.ts), measured:
//   node scripts/learn-workings.mjs <train.jsonl> <test.jsonl> [test items] [least] [ratio]
// The packs' word facts are forgotten; each training situation's working votes for the words beside
// its amounts; what enough agree on is kept. Then: against the packs, and the test situations
// worked with the packs' facts, with none, and with only what was learned.
import { readFileSync, writeFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { lemma } from "../dist/runtime/host.js";
import { lexicon } from "../dist/situation/lexicon.js";
import { situationOf, solve } from "../dist/situation/situation.js";
import { votes } from "../dist/situation/worked.js";

const [trainFile, testFile, nTest = "100", least = "3", ratio = "3", out] = process.argv.slice(2);
const lines = (f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const train = lines(trainFile);
const test = lines(testFile).slice(0, Number(nTest)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const store = new ConceptStore();
seed(store);
const lex = lexicon(store);
const LEARNED = ["Removes", "Adds", "Compares", "Changes"];
const score = (items) => {
  let right = 0;
  for (const x of items) {
    const s = situationOf(store, x.q);
    if (!s || s.amounts.length > 8) continue;
    const got = solve(s.amounts, s.asked);
    if (got && Math.abs(got.value - x.want) < 1e-6) right++;
  }
  return right;
};

lex.forget([]);
const said = (word, predicate) => {
  const v = predicate.startsWith("Effect") ? lex.effect(word) : predicate === "Compares" ? lex.compares(word) : lex.changes(word);
  return v > 0 ? "Up" : v < 0 ? "Down" : undefined;
};
const tally = new Map();
const t0 = Date.now();
for (const x of train) {
  for (const g of votes(lex, x.question, x.answer)) {
    const k = `${lemma(g.word)}|${g.predicate}`;
    const c = tally.get(k) ?? { Up: 0, Down: 0, words: new Set() };
    c[g.value]++;
    c.words.add(g.word);
    tally.set(k, c);
  }
}
// Against how often anything is taken away: most workings add up, so a word is learned as taking
// away when it is taken away clearly more often than words are, and as adding when clearly less.
const base = {};
for (const [k, c] of tally) {
  const p = k.split("|")[1];
  base[p] ??= { up: 0, down: 0 };
  base[p].up += c.Up;
  base[p].down += c.Down;
}
const learned = [];
for (const [k, c] of tally) {
  const [word, predicate] = k.split("|");
  const n = c.Up + c.Down;
  const p0 = base[predicate].down / (base[predicate].up + base[predicate].down);
  const z = (c.Down / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
  if (n < Number(least)) continue;
  // A doing adds by default, so it is weighed against how often doings take away; a comparing or
  // changing word goes one way or the other, so by which way it clearly goes.
  let value;
  if (predicate.startsWith("Effect")) {
    if (Math.abs(z) < Number(ratio)) continue;
    value = z > 0 ? "Down" : "Up";
  } else {
    if (Math.max(c.Up, c.Down) < 3 * Math.min(c.Up, c.Down)) continue;
    value = c.Up > c.Down ? "Up" : "Down";
  }
  learned.push({ word, predicate, value, n: value === "Up" ? c.Up : c.Down, against: value === "Up" ? c.Down : c.Up, words: [...c.words], z });
}
console.log(Object.entries(base).map(([p, b]) => `${p}: ${(100 * b.down / (b.up + b.down)).toFixed(0)}% taken away`).join(", "));
let agree = 0, differ = 0, unknown = 0;
const rows = learned.map((g) => {
  const p = said(g.word, g.predicate) ?? g.words.map((w) => said(w, g.predicate)).find(Boolean);
  if (p === undefined) unknown++;
  else if (p === g.value) agree++;
  else differ++;
  return `  ${g.word} ${g.predicate}(${g.value}())  ${g.n}:${g.against}${p === undefined ? "  new" : p === g.value ? "" : `  (packs: ${p})`}`;
});
console.log(`${train.length} workings read in ${((Date.now() - t0) / 1000).toFixed(0)} s. Learned ${learned.length}: ${agree} as the packs say, ${differ} otherwise, ${unknown} new.`);
console.log(rows.sort().join("\n"));
if (out) writeFileSync(out, JSON.stringify(learned.map(({ word, predicate, value, n, against, words }) => ({ word, predicate, value, n, against, words })), null, 1));

const withPacks = score(test);
lex.forget(LEARNED);
const withNone = score(test);
for (const g of learned) for (const w of new Set([g.word, ...g.words])) lex.suppose(w, g.predicate, g.value);
const withLearned = score(test);
lex.unsuppose();
lex.forget([]);
// Both: what was learned where the packs say nothing.
for (const g of learned) for (const w of new Set([g.word, ...g.words])) if (said(w, g.predicate) === undefined) lex.suppose(w, g.predicate, g.value);
const withBoth = score(test);
lex.unsuppose();
console.log(`\nTest (${test.length}): with the packs' word facts ${withPacks}, with none ${withNone}, with only what was learned ${withLearned}, with both ${withBoth}.`);
