// The solver's weights tuned on worked examples by what they get right:
//   node scripts/tune-weights.mjs <train.jsonl> <test.jsonl> [train items] [test items]
// Each training situation is read once and every reading kept with what it agreed with; weights are
// then moved one at a time, kept when more of the tuning set comes out right and the held-out set
// does not get worse. The test set is read once at the start (prior) and once at the end.
import { readFileSync, writeFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { PRIOR, readings, situationOf, weighWith } from "../dist/situation/situation.js";

const [trainFile, testFile, nTrain = "2000", nTest = "400", out] = process.argv.slice(2);
const read = (f, n) => readFileSync(f, "utf8").trim().split("\n").slice(0, Number(n)).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const store = new ConceptStore();
seed(store);
const pools = (items) =>
  items.map((x) => {
    const s = situationOf(store, x.q);
    weighWith({ ...PRIOR });
    const r = s && s.amounts.length <= 8 ? readings(s.amounts, s.asked) : undefined;
    return { want: x.want, ranked: r?.ranked ?? [] };
  });
let t = Date.now();
const train = pools(read(trainFile, nTrain));
const test = pools(read(testFile, nTest));
console.log(`read in ${((Date.now() - t) / 1000).toFixed(0)} s`);
const keys = [...new Set([...Object.keys(PRIOR), ...train.flatMap((p) => p.ranked.flatMap((r) => Object.keys(r.features)))])];
const right = (set, w) => {
  let n = 0;
  for (const p of set) {
    let best, bs = -Infinity;
    for (const r of p.ranked) {
      let s = 0;
      for (const k in r.features) s += (w[k] ?? 0) * r.features[k];
      if (s > bs) (bs = s), (best = r);
    }
    if (best && Math.abs(best.value - p.want) < 1e-6) n++;
  }
  return n;
};
const cut = Math.floor(train.length * 0.75);
const tune = train.slice(0, cut), held = train.slice(cut);
let w = { ...PRIOR };
let tr = right(tune, w), he = right(held, w);
console.log(`prior: tune ${tr}/${tune.length}, held ${he}/${held.length}, test ${right(test, w)}/${test.length}`);
for (let round = 0; round < 6; round++) {
  let moved = false;
  for (const k of keys) {
    for (const d of [-2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2]) {
      const v = { ...w, [k]: Math.round(((w[k] ?? 0) + d) * 100) / 100 };
      const a = right(tune, v), b = right(held, v);
      if (a > tr && b >= he) {
        (w = v), (tr = a), (he = b), (moved = true);
      }
    }
  }
  console.log(`round ${round + 1}: tune ${tr}, held ${he}`);
  if (!moved) break;
}
console.log(keys.filter((k) => (w[k] ?? 0) !== (PRIOR[k] ?? 0)).map((k) => `  ${k}: ${PRIOR[k] ?? 0} -> ${w[k]}`).join("\n"));
console.log(`test (${test.length}): prior ${right(test, PRIOR)}, tuned ${right(test, w)}`);
if (out) writeFileSync(out, JSON.stringify(w, null, 1));
