// Learning what words do to amounts from worked examples (src/situation/learnwords.ts), measured:
//   node scripts/learn-words.mjs <train.jsonl> <test.jsonl> [train items] [test items] [epochs]
// What the packs say words do (Removes/Adds, Compares, Changes) is forgotten; each training
// situation with its answer is read for what its words must do for the answer to come out; what
// enough agree on is kept. Then: what was learned against what the packs say, and the test
// situations worked with the packs' facts, with none, and with only what was learned.
import { readFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { lexicon } from "../dist/situation/lexicon.js";
import { situationOf, solve } from "../dist/situation/situation.js";
import { agreed, noEvidence, weigh } from "../dist/situation/learnwords.js";

const [trainFile, testFile, nTrain = "500", nTest = "100", nEpochs = "3"] = process.argv.slice(2);
const read = (f, n) => readFileSync(f, "utf8").trim().split("\n").slice(0, Number(n)).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const train = read(trainFile, nTrain);
const test = read(testFile, nTest);
const store = new ConceptStore();
seed(store);
const lex = lexicon(store);
const LEARNED = ["Removes", "Adds", "Compares", "Changes"];

const score = (items, budget = 8) => {
  let right = 0;
  for (const x of items) {
    const s = situationOf(store, x.q);
    if (!s || s.amounts.length > budget) continue;
    const got = solve(s.amounts, s.asked);
    if (got && Math.abs(got.value - x.want) < 1e-6) right++;
  }
  return right;
};

lex.unsuppose();
lex.forget([]);
const withPacks = score(test);
lex.forget(LEARNED);
const withNone = score(test);

let learned = [];
const evidence = noEvidence();
for (let e = 1; e <= Number(nEpochs); e++) {
  const t = Date.now();
  let already = 0;
  for (const x of train) if (weigh(store, x.q, x.want, learned, evidence)) already++;
  learned = agreed(evidence);
  console.log(`epoch ${e}: ${already}/${train.length} training situations right before this pass; ${learned.length} word facts agreed (${((Date.now() - t) / 1000).toFixed(0)} s)`);
}

// Against what the packs say.
lex.unsuppose();
lex.forget([]);
const said = (g) => (g.predicate === "Effect" ? (lex.effect(g.word) > 0 ? "Up" : lex.effect(g.word) < 0 ? "Down" : undefined) : g.predicate === "Compares" ? ({ 1: "Up", "-1": "Down" })[lex.compares(g.word)] : ({ 1: "Up", "-1": "Down" })[lex.changes(g.word)]);
let agree = 0, differ = 0, unknown = 0;
const rows = learned.map((g) => {
  const p = said(g);
  if (p === undefined) unknown++;
  else if (p === g.value) agree++;
  else differ++;
  const n = evidence.for.get(`${g.word}|${g.predicate}|${g.value}`) ?? 0;
  const a = evidence.against.get(`${g.word}|${g.predicate}|${g.value}`) ?? 0;
  return `  ${g.word} ${g.predicate}(${g.value}())  for ${n}, against ${a}${p === undefined ? "  (new: the packs say nothing)" : p === g.value ? "" : `  (the packs say ${p})`}`;
});
console.log(`\nLearned ${learned.length}: ${agree} as the packs say, ${differ} otherwise, ${unknown} the packs say nothing of.`);
console.log(rows.sort().join("\n"));

lex.forget(LEARNED);
for (const g of learned) lex.suppose(g.word, g.predicate, g.value);
const withLearned = score(test);
lex.unsuppose();
lex.forget([]);
console.log(`\nTest (${test.length}): with the packs' word facts ${withPacks}, with none ${withNone}, with only what was learned ${withLearned}.`);
