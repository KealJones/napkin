// What words mean, learned from worked examples (src/situation/fromworkings.ts), measured:
//   node scripts/learn-meanings.mjs <train.jsonl> <test.jsonl> [test items] [--keep]
// Learns from every training question and its working; prints what was learned as graph facts and
// how it stands against the packs; then works the test situations with the packs' word meanings,
// with none of them, and with only what was learned.
import { readFileSync } from "node:fs";
import { format } from "../dist/concept/expression.js";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { lexicon } from "../dist/situation/lexicon.js";
import { situationOf, solve } from "../dist/situation/situation.js";
import { learnFromWorkings, supposeLearned } from "../dist/situation/fromworkings.js";

const [trainFile, testFile, nTest = "400"] = process.argv.slice(2);
const lines = (f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const train = lines(trainFile).map((x) => ({ question: x.question, working: x.answer }));
const test = lines(testFile).slice(0, Number(nTest)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const store = new ConceptStore();
seed(store);
const lex = lexicon(store);
const MEANINGS = ["Removes", "Compares", "Changes", "Number"];

let t = Date.now();
const learned = learnFromWorkings(store, train);
console.log(`${learned.length} meanings learned from ${train.length} workings in ${((Date.now() - t) / 1000).toFixed(0)} s`);
// Against the packs: what they say of the same word, read the same way.
const packSays = (l) => {
  const h = l.claim.head;
  if (h === "Removes" || h === "Adds") {
    const v = l.claim.args.length ? lex.effectOnMoney(l.word) ?? lex.effect(l.word) : lex.effect(l.word);
    return v > 0 ? "Adds" : v < 0 ? "Removes" : undefined;
  }
  if (h === "SynonymOf") return lex.count(l.word);
  const v = h === "Compares" ? lex.compares(l.word) : lex.changes(l.word);
  return v > 0 ? "Up" : v < 0 ? "Down" : undefined;
};
const learnedSays = (l) => (l.claim.head === "Removes" || l.claim.head === "Adds" ? l.claim.head : l.claim.head === "SynonymOf" ? l.claim.args[0].value.args[0].value : l.claim.args[0].value.head);
let agree = 0, differ = 0, fresh = 0;
const rows = learned.map((l) => {
  const p = packSays(l), s = learnedSays(l);
  p === undefined ? fresh++ : p === s ? agree++ : differ++;
  return `  ${l.word} ${format(l.claim)}  ${l.for}:${l.against}${p === undefined ? "  new" : p === s ? "" : `  (packs: ${p})`}`;
});
console.log(`${agree} as the packs say, ${differ} otherwise, ${fresh} new`);
console.log(rows.sort().join("\n"));

const score = () => test.filter((x) => { const s = situationOf(store, x.q); const g = s && s.amounts.length <= 8 ? solve(s.amounts, s.asked) : undefined; return g && Math.abs(g.value - x.want) < 1e-6; }).length;
t = Date.now();
const withPacks = score();
lex.forget(MEANINGS);
const withNone = score();
supposeLearned(lex, learned);
const withLearned = score();
lex.unsuppose();
lex.forget([]);
console.log(`\ntest (${test.length}): the packs' meanings ${withPacks}, none ${withNone}, learned ${withLearned} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
