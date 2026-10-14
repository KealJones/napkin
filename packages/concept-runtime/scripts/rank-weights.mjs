// The solver's weights learned to rank the readings that come out right above the rest:
//   node scripts/rank-weights.mjs <train.jsonl> <test.jsonl> [train items] [test items] [cache dir]
// Each situation is read once (cached); the weights are fit by a softmax over each situation's
// readings, the ones whose answer is right pulled up, kept near where they started (L2 to the
// prior), the pull chosen on a held-out quarter of the training set. Test read at the end.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { PRIOR, readings, situationOf, weighWith } from "../dist/situation/situation.js";

const [trainFile, testFile, nTrain = "2000", nTest = "400", cache = "/tmp", out] = process.argv.slice(2);
const read = (f, n) => readFileSync(f, "utf8").trim().split("\n").slice(0, Number(n)).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: Number(x.answer.split("####").pop().trim().replace(/,/g, "")) }));
const store = new ConceptStore();
seed(store);
const pools = (name, items) => {
  const file = `${cache}/pools-${name}-${items.length}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const p = items.map((x) => {
    const s = situationOf(store, x.q);
    weighWith({ ...PRIOR });
    const r = s && s.amounts.length <= 8 ? readings(s.amounts, s.asked) : undefined;
    return { want: x.want, ranked: (r?.ranked ?? []).map((y) => ({ value: y.value, features: y.features })) };
  });
  writeFileSync(file, JSON.stringify(p));
  return p;
};
let t = Date.now();
const train = pools("train", read(trainFile, nTrain));
const test = pools("test", read(testFile, nTest));
console.log(`read in ${((Date.now() - t) / 1000).toFixed(0)} s`);
const isRight = (p, r) => Math.abs(r.value - p.want) < 1e-6;
const right = (set, w) => {
  let n = 0;
  for (const p of set) {
    let best, bs = -Infinity;
    for (const r of p.ranked) {
      let s = 0;
      for (const k in r.features) s += (w[k] ?? 0) * r.features[k];
      if (s > bs) (bs = s), (best = r);
    }
    if (best && isRight(p, best)) n++;
  }
  return n;
};
const fit = (set, lambda, iters = 300, lr = 0.05) => {
  const w = { ...PRIOR };
  const useful = set.filter((p) => p.ranked.some((r) => isRight(p, r)) && p.ranked.some((r) => !isRight(p, r)));
  const m = {}, v = {};
  for (let it = 1; it <= iters; it++) {
    const g = {};
    for (const p of useful) {
      const s = p.ranked.map((r) => {
        let x = 0;
        for (const k in r.features) x += (w[k] ?? 0) * r.features[k];
        return x;
      });
      const mx = Math.max(...s);
      const e = s.map((x) => Math.exp(x - mx));
      const all = e.reduce((a, b) => a + b, 0);
      const rightSum = e.reduce((a, x, i) => a + (isRight(p, p.ranked[i]) ? x : 0), 0);
      p.ranked.forEach((r, i) => {
        const coef = (isRight(p, r) ? e[i] / rightSum : 0) - e[i] / all;
        if (Math.abs(coef) < 1e-9) return;
        for (const k in r.features) g[k] = (g[k] ?? 0) + coef * r.features[k];
      });
    }
    // Adam, ascending the log likelihood, with L2 toward the prior.
    for (const k of new Set([...Object.keys(g), ...Object.keys(w)])) {
      const grad = (g[k] ?? 0) / useful.length - lambda * ((w[k] ?? 0) - (PRIOR[k] ?? 0));
      m[k] = 0.9 * (m[k] ?? 0) + 0.1 * grad;
      v[k] = 0.999 * (v[k] ?? 0) + 0.001 * grad * grad;
      const mh = m[k] / (1 - 0.9 ** it), vh = v[k] / (1 - 0.999 ** it);
      w[k] = (w[k] ?? 0) + (lr * mh) / (Math.sqrt(vh) + 1e-8);
    }
  }
  return w;
};
const cut = Math.floor(train.length * 0.75);
const tune = train.slice(0, cut), held = train.slice(cut);
console.log(`prior: tune ${right(tune, PRIOR)}/${tune.length}, held ${right(held, PRIOR)}/${held.length}, test ${right(test, PRIOR)}/${test.length}`);
let best;
for (const lambda of [0.3, 0.1, 0.03, 0.01]) {
  t = Date.now();
  const w = fit(tune, lambda);
  const h = right(held, w);
  console.log(`  pull ${lambda}: tune ${right(tune, w)}, held ${h} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  if (!best || h > best.h) best = { lambda, h };
}
const w = fit(train, best.lambda);
const moved = Object.entries(w).filter(([k, x]) => Math.abs(x - (PRIOR[k] ?? 0)) > 0.3).sort((a, b) => Math.abs(b[1] - (PRIOR[b[0]] ?? 0)) - Math.abs(a[1] - (PRIOR[a[0]] ?? 0)));
console.log(moved.slice(0, 40).map(([k, x]) => `  ${k}: ${PRIOR[k] ?? 0} -> ${x.toFixed(2)}`).join("\n"));
console.log(`test (${test.length}): prior ${right(test, PRIOR)}, learned (pull ${best.lambda}) ${right(test, w)}`);
if (out) writeFileSync(out, JSON.stringify(w));
