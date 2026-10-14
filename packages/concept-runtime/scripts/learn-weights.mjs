// The solver's weights learned from worked examples (src/situation/weights.ts), measured:
//   node scripts/learn-weights.mjs <train.jsonl> <test.jsonl> [train items] [test items] [epochs]
import { readFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { PRIOR, situationOf, solve, weighWith } from "../dist/situation/situation.js";
import { learnWeights } from "../dist/situation/weights.js";

const [trainFile, testFile, nTrain = "2000", nTest = "400", epochs = "3"] = process.argv.slice(2);
const read = (f, from, n) => readFileSync(f, "utf8").trim().split("\n").slice(from, from + Number(n)).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const train = read(trainFile, 0, nTrain);
const test = read(testFile, 0, nTest);
const store = new ConceptStore();
seed(store);
const score = (items, w) => {
  let right = 0;
  for (const x of items) {
    weighWith(w);
    const s = situationOf(store, x.q);
    if (!s || s.amounts.length > 8) continue;
    weighWith(w);
    const g = solve(s.amounts, s.asked);
    if (g && Math.abs(g.value - x.want) < 1e-6) right++;
  }
  return right;
};
const before = score(test, { ...PRIOR });
const t = Date.now();
const { weights, right } = learnWeights(store, train, Number(epochs));
console.log(`learned from ${train.length} in ${((Date.now() - t) / 1000).toFixed(0)} s; right on train each pass: ${right.join(", ")}`);
console.log(Object.keys(PRIOR).map((k) => `  ${k}: ${PRIOR[k]} -> ${weights[k]}`).join("\n"));
console.log(`test (${test.length}): prior ${before}, learned ${score(test, weights)}`);
