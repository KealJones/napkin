// Learning what words do to amounts from worked examples (src/situation/learnwords.ts), measured:
//   node scripts/learn-words.mjs <train.jsonl> <test.jsonl> [train items] [test items] [epochs] [evidence.json]
// What the packs say words do (Removes/Adds, Compares, Changes) is forgotten; each training
// situation with its answer is read for what its words must do for the answer to come out; what
// enough agree on is kept. Words never learned are read as their neighbours are (the company they
// keep across the training text). Then: what was learned against what the packs say, and the test
// situations worked with the packs' facts, with none, with only what was learned, and with
// neighbours too. With an evidence file that exists, the training passes are skipped and it is read.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { lexicon } from "../dist/situation/lexicon.js";
import { situationOf, solve } from "../dist/situation/situation.js";
import { agreed, byNeighbours, candidates, companyOf, noEvidence, weigh } from "../dist/situation/learnwords.js";

const [trainFile, testFile, nTrain = "500", nTest = "100", nEpochs = "3", evidenceFile] = process.argv.slice(2);
const read = (f, n) => readFileSync(f, "utf8").trim().split("\n").slice(0, Number(n)).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const train = read(trainFile, nTrain);
const test = read(testFile, nTest);
const store = new ConceptStore();
seed(store);
const lex = lexicon(store);
const FORGET = ["Removes", "Adds", "Compares", "Changes"];
const put = (gs) => {
  lex.unsuppose();
  for (const g of gs) lex.suppose(g.word, g.predicate, g.value === "None" ? undefined : g.value);
};

const score = (items, extra = () => []) => {
  let right = 0;
  for (const x of items) {
    put(extra(x));
    const s = situationOf(store, x.q);
    if (!s || s.amounts.length > 8) continue;
    const got = solve(s.amounts, s.asked);
    if (got && Math.abs(got.value - x.want) < 1e-6) right++;
  }
  lex.unsuppose();
  return right;
};

lex.forget([]);
const withPacks = score(test);
lex.forget(FORGET);
const withNone = score(test);

let evidence = noEvidence();
let learned = [];
if (evidenceFile && existsSync(evidenceFile)) {
  const e = JSON.parse(readFileSync(evidenceFile, "utf8"));
  evidence = { for: new Map(e.for), against: new Map(e.against) };
  learned = agreed(evidence, Number(process.env.LEAST ?? 1.5), Number(process.env.RATIO ?? 3));
  console.log(`evidence read from ${evidenceFile}`);
} else {
  for (let e = 1; e <= Number(nEpochs); e++) {
    const t = Date.now();
    let already = 0;
    for (const x of train) if (weigh(store, x.q, x.want, learned, evidence)) already++;
    learned = agreed(evidence);
    console.log(`epoch ${e}: ${already}/${train.length} training situations right before this pass; ${learned.length} word facts agreed (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
  if (evidenceFile) writeFileSync(evidenceFile, JSON.stringify({ for: [...evidence.for], against: [...evidence.against] }));
}

// Against what the packs say.
lex.forget([]);
lex.unsuppose();
const way = (n) => (n > 0 ? "Up" : n < 0 ? "Down" : "None");
const said = (g) => way(g.predicate === "Effect" ? lex.effect(g.word) : g.predicate === "Compares" ? lex.compares(g.word) : lex.changes(g.word));
let agree = 0, differ = 0, fresh = 0;
const rows = learned
  .filter((g) => g.value !== "None")
  .map((g) => {
    const p = said(g);
    if (p === "None") fresh++;
    else if (p === g.value) agree++;
    else differ++;
    const n = evidence.for.get(`${g.word}|${g.predicate}|${g.value}`) ?? 0;
    const a = evidence.against.get(`${g.word}|${g.predicate}|${g.value}`) ?? 0;
    return `  ${g.word} ${g.predicate}(${g.value}())  for ${n.toFixed(1)}, against ${a.toFixed(1)}${p === "None" ? "  (new)" : p === g.value ? "" : `  (the packs say ${p})`}`;
  });
const none = learned.filter((g) => g.value === "None").length;
console.log(`\nLearned ${learned.length}: ${none} that do nothing; of the rest ${agree} as the packs say, ${differ} otherwise, ${fresh} the packs say nothing of.`);
console.log(rows.sort().join("\n"));

// Words of the test never learned, read as their neighbours.
const company = companyOf([...train.map((x) => x.q), ...test.map((x) => x.q)]);
const fromNeighbours = new Map();
const neighbours = (x) => {
  const known = new Set(learned.map((g) => `${g.word}|${g.predicate}`));
  const extra = [];
  for (const c of candidates(x.q)) {
    if (known.has(`${c.word}|${c.predicate}`)) continue;
    const v = byNeighbours(company, learned, c.word, c.predicate, Number(process.env.NEAR ?? 0.35));
    if (v) {
      extra.push({ word: c.word, predicate: c.predicate, value: v });
      fromNeighbours.set(`${c.word} ${c.predicate}`, v);
    }
  }
  return [...learned, ...extra];
};
lex.forget(FORGET);
const withLearned = score(test, () => learned);
const withNeighbours = score(test, neighbours);
lex.forget([]);
console.log(`\nRead by their neighbours (${fromNeighbours.size}): ${[...fromNeighbours].map(([w, v]) => `${w} ${v}`).join(", ")}`);
console.log(`\nTest (${test.length}): with the packs' word facts ${withPacks}, with none ${withNone}, with only what was learned ${withLearned}, learned and neighbours ${withNeighbours}.`);
