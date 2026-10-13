// Napkin on a public benchmark, honestly scored: each item asked as it is written, on a fresh graph
// with learning on, the answer read from what Napkin said. Run in CI (.github/workflows/live-probe.yml,
// input bench=), where the datasets and the sources can be reached.
//
//   gsm8k   grade-school maths word problems (openai/grade-school-math, MIT): the last number said
//           must equal the answer after "####".
import { ConceptStore } from "../dist/store/store.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { turn } from "../dist/runtime/turn.js";
import { seed } from "../dist/seed/seed.js";
import { c } from "../dist/concept/expression.js";

const which = process.argv[2] ?? "gsm8k";
const n = Number(process.argv[3] ?? 50);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timed out")), ms))]);

async function gsm8k() {
  const text = await (await fetch("https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl")).text();
  return text.trim().split("\n").slice(0, n).map((l) => JSON.parse(l)).map((x) => ({ q: x.question, want: x.answer.split("####").pop().trim().replace(/,/g, "") }));
}

const items = which === "gsm8k" ? await gsm8k() : [];
let right = 0;
let answered = 0;
const lines = [];
for (const [i, item] of items.entries()) {
  const store = new ConceptStore();
  seed(store);
  let said = "";
  try {
    said = (await withTimeout(turn(new Runtime(store, {}), item.q, c("Execution"), {}), 60_000)).spoken;
  } catch (e) {
    said = `(${e.message})`;
  }
  const numbers = said.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) ?? [];
  const got = numbers.at(-1);
  const ok = got !== undefined && Number(got) === Number(item.want);
  if (ok) right += 1;
  if (!/don't know|couldn't|can't|put it another way/i.test(said)) answered += 1;
  lines.push(`${ok ? "RIGHT" : "wrong"} #${i + 1} want ${item.want}, said: ${said.slice(0, 160).replace(/\n/g, " ")}`);
}
console.log(`\n${which}: ${right}/${items.length} right (${((100 * right) / Math.max(1, items.length)).toFixed(1)}%); answered (not "I don't know") ${answered}/${items.length}\n`);
for (const l of lines) console.log(l);
