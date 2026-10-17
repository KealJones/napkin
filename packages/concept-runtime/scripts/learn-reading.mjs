// Learn the one reader's weights (how readily each word role takes each hole from each side) from
// word problems with known answers: each sentence's best few readings are tried, and when another
// reading than the first gives the answer, its choices are weighed up and the first's down
// (a perceptron over the composer's features). Only hole-and-side features are learned, never a
// word's own ("as:apples=ReadThing"): what generalizes, not a word list.
//
//   node scripts/learn-reading.mjs <items.jsonl> [from] [to] [--write]
//
// --write puts the learned weights in sources/reading/header.ncon (then rebuild the pack).
import { readFileSync, writeFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { seed } from "../dist/seed/seed.js";
import { c, call } from "../dist/concept/expression.js";
import { readSentences, situationFromSentences } from "../dist/situation/read.js";
import { solve } from "../dist/situation/situation.js";

const [file, fromArg, toArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const write = process.argv.includes("--write");
const items = readFileSync(file, "utf8").trim().split("\n").flatMap((l) => { try { const x = JSON.parse(l); return Array.isArray(x) ? x : [x]; } catch { return []; } });
const from = Number(fromArg ?? 1), to = Number(toArg ?? items.length);
const store = new ConceptStore();
seed(store);
const weights = new Map();
for (const t of store.asSubject("ReadingByHoles")) if (t.predicate === "Weighs" && t.expr.args) { const [k, v] = t.expr.args.map((a) => a.value); if (typeof k === "string" && typeof v === "number") weights.set(k, v); }
const start = new Map(weights);
const LR = 0.15, K = 3, BUDGET = 40;
const learnable = (f) => !f.startsWith("as:");
const set = (f, v) => { weights.set(f, v); store.addRelation("ReadingByHoles", call("Weighs", [{ value: f }, { value: Math.round(v * 1000) / 1000 }])); };
const answerOf = (sentences, choice) => {
  const chosen = sentences.map((s, i) => ({ ...s, piece: (s.ranked[choice[i]] ?? s.ranked[0]).piece }));
  const sit = situationFromSentences(store, chosen);
  const solved = sit ? solve(sit.amounts, sit.asked) : undefined;
  return solved ? solved.value : undefined;
};
let right0 = 0, fixed = 0, seen = 0;
for (const it of items.filter((x) => x.i >= from && x.i <= to)) {
  seen++;
  const want = Number(String(it.a).replace(/,/g, ""));
  const sentences = await readSentences(new Runtime(store, { traceQuiet: true }), it.q).catch(() => []);
  if (sentences.length < 2) continue;
  const base = sentences.map(() => 0);
  if (answerOf(sentences, base) === want) { right0++; continue; }
  // Change one sentence's reading at a time, then two.
  const tries = [];
  sentences.forEach((s, i) => { for (let k = 1; k < Math.min(K, s.ranked.length); k++) tries.push(base.map((b, j) => (j === i ? k : b))); });
  for (let a = 0; a < sentences.length && tries.length < BUDGET; a++) for (let b = a + 1; b < sentences.length && tries.length < BUDGET; b++) for (let ka = 1; ka < Math.min(K, sentences[a].ranked.length); ka++) for (let kb = 1; kb < Math.min(K, sentences[b].ranked.length); kb++) tries.push(base.map((x, j) => (j === a ? ka : j === b ? kb : x)));
  const good = tries.slice(0, BUDGET).find((t) => answerOf(sentences, t) === want);
  if (!good) continue;
  fixed++;
  good.forEach((k, i) => {
    if (k === 0) return;
    const up = sentences[i].ranked[k].features.filter(learnable), down = sentences[i].ranked[0].features.filter(learnable);
    for (const f of up) set(f, (weights.get(f) ?? 0) + LR);
    for (const f of down) set(f, (weights.get(f) ?? 0) - LR);
  });
}
console.log(`${seen} items: ${right0} right as first read, ${fixed} put right by another reading (weights moved)`);
const moved = [...weights].filter(([k, v]) => Math.abs(v - (start.get(k) ?? 0)) > 1e-9).sort((a, b) => Math.abs(b[1] - (start.get(b[0]) ?? 0)) - Math.abs(a[1] - (start.get(a[0]) ?? 0)));
for (const [k, v] of moved.slice(0, 40)) console.log(`  ${k}: ${(start.get(k) ?? 0).toFixed(2)} -> ${v.toFixed(2)}`);
if (write) {
  const path = new URL("../sources/reading/header.ncon", import.meta.url);
  let src = readFileSync(path, "utf8");
  const block = moved.map(([k, v]) => `Weighs("${k}", ${Math.round(v * 100) / 100})`);
  src = src.replace(/\n\/\/ Learned from word problems[\s\S]*?\n\)\n/, "\n");
  src += `\n// Learned from word problems with known answers (scripts/learn-reading.mjs, ${seen} items): the weights that read them right.\nConcept(ReadingByHoles(),\n  ${block.join(",\n  ")}\n)\n`;
  writeFileSync(path, src);
  console.log(`wrote ${block.length} weights`);
}
