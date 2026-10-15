// How much of everyday talk the frames read, and what goes to the rules: run in CI (live-probe,
// test=scripts/frames-coverage.mjs), where DailyDialog can be fetched and words looked up. Each
// utterance is said as the first message of a conversation, with learning on.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { turn } from "../dist/runtime/turn.js";
import { seed } from "../dist/seed/seed.js";
import { c, format } from "../dist/concept/expression.js";

const file = "data/dialog/dumps/train/dialogues_train.txt";
if (!existsSync(file)) execSync("sh src/seed/dialogue/fetch.sh", { stdio: "inherit" });
const utterances = readFileSync(file, "utf8").split("\n").flatMap((l) => l.split("__eou__")).map((u) => u.trim().replace(/\s+([,.!?'])/g, "$1").replace(/\s+'\s*/g, "'")).filter((u) => u.length > 3 && u.length < 90);
// A spread of them, the same each run.
const picked = [];
for (let i = 0; picked.length < Number(process.env.N ?? 120) && i < utterances.length; i += 997) picked.push(utterances[i]);
let frames = 0, rules = 0, dunno = 0, garbled = 0;
const byRules = [];
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timed out")), ms))]);
for (const u of picked) {
  const store = new ConceptStore();
  seed(store);
  let t;
  try {
    t = await withTimeout(turn(new Runtime(store, {}), u, c("Execution"), {}), 45000);
  } catch (e) {
    rules++;
    byRules.push(`${u}  =>  (${e.message})`);
    continue;
  }
  if (t.hearingUsed === "frames") frames++;
  else {
    rules++;
    byRules.push(`${u}  =>  ${t.spoken.slice(0, 120)}  [${t.expression ? format(t.expression).slice(0, 100) : ""}]`);
  }
  if (/don't know|couldn't|can't|put it another way/i.test(t.spoken)) dunno++;
  // A reply that shows the machinery: how it heard, what it is missing, an expression, a description no one asked for.
  if (/I heard that as|don't know how to|worked something out|Where I got stuck| means [a-z]|\w\(\)/.test(t.spoken)) garbled++;
}
console.log(`${picked.length} DailyDialog utterances: frames read ${frames}, rules ${rules}; "don't know" in ${dunno}; machinery shown in ${garbled}.`);
console.log("\nHeard by the rules:\n" + byRules.join("\n"));
