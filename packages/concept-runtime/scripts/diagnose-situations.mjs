// Why a situation's right answer is not among its readings, told by its working:
//   node scripts/diagnose-situations.mjs <train.jsonl> [items]
import { readFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { readings, situationOf, sayUnit } from "../dist/situation/situation.js";
import { lexicon } from "../dist/situation/lexicon.js";

const [file, n = "600", show = "0"] = process.argv.slice(2);
const items = readFileSync(file, "utf8").trim().split("\n").slice(0, Number(n)).map((l) => JSON.parse(l));
const store = new ConceptStore();
seed(store);
const lex = lexicon(store);
const counts = {};
const tally = (k) => (counts[k] = (counts[k] ?? 0) + 1);
const examples = {};
for (const x of items) {
  const want = Number(x.answer.split("####").pop().trim().replace(/,/g, ""));
  const steps = [...x.answer.matchAll(/<<([^=>]+)=([^>]+)>>/g)].map((m) => ({ expr: m[1].replace(/\s+/g, ""), result: Number(m[2]) }));
  const results = new Set(steps.map((s) => s.result));
  const literals = steps.flatMap((s) => (s.expr.match(/\d*\.?\d+/g) ?? []).map(Number)).filter((v) => !results.has(v));
  const qnums = new Set([...(x.question.replace(/,(\d{3})/g, "$1").match(/\d*\.?\d+/g) ?? []).map(Number), ...(x.question.toLowerCase().match(/[a-z]+/g) ?? []).map((w) => lex.count(w)).filter((v) => v !== undefined)]);
  const s = situationOf(store, x.question);
  const r = s && s.amounts.length <= 8 ? readings(s.amounts, s.asked) : undefined;
  const inPool = !!r?.ranked.some((y) => Math.abs(y.value - want) < 1e-6);
  if (inPool) {
    tally(Math.abs((r.best?.value ?? NaN) - want) < 1e-6 ? "right" : "chosen wrong");
    continue;
  }
  const reasons = [];
  if (!s) reasons.push("not read");
  else {
    const have = new Set(s.amounts.map((a) => a.value));
    const missing = [...new Set(literals.filter((v) => qnums.has(v) && !have.has(v) && !s.amounts.some((a) => a.derived)))];
    if (missing.length) reasons.push("missing amount");
    const outside = [...new Set(literals.filter((v) => !qnums.has(v) && !have.has(v)))];
    if (outside.length) reasons.push(`outside number`);
    const twice = literals.filter((v, i) => qnums.has(v) && literals.indexOf(v) !== i);
    if (twice.length) reasons.push("used twice");
    if (r && !r.ranked.length) reasons.push("nothing in the unit asked");
    if (s.amounts.length > 8) reasons.push("too many amounts");
  }
  if (!reasons.length) reasons.push("structure not reached");
  for (const k of reasons) {
    tally(k);
    (examples[k] ??= []).push({ q: x.question, w: steps.map((s) => `${s.expr}=${s.result}`).join("; "), a: s ? s.amounts.map((a) => `${a.value} ${sayUnit(a.unit)}`).join(", ") + ` | asked ${sayUnit(s.asked.unit)}` : "-" });
  }
}
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join("\n"));
for (const [k, list] of Object.entries(examples)) if (Number(show)) {
  console.log(`\n== ${k}`);
  for (const e of list.slice(0, Number(show))) console.log(`Q: ${e.q.slice(0, 260)}\n   W: ${e.w}\n   A: ${e.a}`);
}
