// SPIKE: hearing time only, median of REPS runs, at the given line counts (the scoreboard's pool).
// The hash of what was heard shows a change kept the result.
//   node scripts/bench-hear.mjs [--lines 1000,5000] [--reps 5]
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { importTypeScript } from "../dist/code/import.js";
import { c, call, format, isCall } from "../dist/concept/expression.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const ts = createRequire(import.meta.url)("typescript");
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const store = new ConceptStore();
seed(store);
// The corpus as it was at a commit (default the spike's base), so editing the files it reads
// does not change what is measured.
const AT = flag("--at", "efee07a");
const source = (f) => execSync(`git -C ${root} show ${AT}:${f.slice(join(root, "../..").length + 1)}`, { maxBuffer: 1 << 26 }).toString();
const files = readFileSync(join(here, "corpus.txt"), "utf8")
  .split("\n")
  .filter((f) => f.endsWith(".ts"))
  .map((f) => join(root, "../..", f))
  .filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });
const hasUnsupported = (e) => isCall(e) && (e.head === "Unsupported" || e.args.some((a) => hasUnsupported(a.value)));
const pool = files
  .flatMap((f) => {
    const t = source(f);
    return ts.createSourceFile("x.ts", t, ts.ScriptTarget.Latest, true).statements.map((s) => t.slice(s.getStart(), s.end));
  })
  .filter((s) => !hasUnsupported(importTypeScript(s).expression));
const reps = Number(flag("--reps", "5"));
for (const target of flag("--lines", "1000,5000").split(",").map(Number)) {
  let text = "";
  for (const s of pool) {
    if (text.split("\n").length >= target) break;
    text += s + "\n";
  }
  const ms = [];
  let out;
  let steps = 0;
  for (let r = 0; r < reps; r++) {
    const rt = new Runtime(store, { maximumSteps: 500_000_000, maximumDepth: 100_000 });
    const t = performance.now();
    out = await rt.evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c("TypeScript"))));
    ms.push(performance.now() - t);
    steps = rt.steps;
  }
  ms.sort((a, b) => a - b);
  let h = 0;
  for (const ch of format(out)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  if (flag("--out")) writeFileSync(`${flag("--out")}.${target}`, out.args.map((a) => format(a.value)).join("\n"));
  console.log(`  ${text.split("\n").length} lines: hear median ${ms[Math.floor(reps / 2)].toFixed(0)} ms (min ${ms[0].toFixed(0)}; ${ms.map((x) => x.toFixed(0)).join(" ")}), ${steps} evaluations, hash ${h}`);
}
