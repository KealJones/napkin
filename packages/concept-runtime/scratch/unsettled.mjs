// Which statements, heard alone, do not come out as one thing: node scratch/unsettled.mjs <file> [limit]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { c, call, format, isCall } from "../dist/concept/expression.js";
const ts = createRequire(import.meta.url)("typescript");
const store = new ConceptStore();
seed(store);
const [file, limit = "20"] = process.argv.slice(2);
const text = readFileSync(file, "utf8");
// Every statement at any depth, smallest first, so the one that breaks is the innermost.
const all = [];
const visit = (node) => {
  if (ts.isStatement(node) && !ts.isBlock(node)) all.push(text.slice(node.getStart(), node.end));
  ts.forEachChild(node, visit);
};
visit(ts.createSourceFile("x.ts", text, 99, true));
all.sort((a, b) => a.length - b.length);
let shown = 0;
const seen = new Set();
for (const s of all) {
  if (shown >= Number(limit)) break;
  const rt = new Runtime(store, { maximumSteps: 50_000_000, maximumDepth: 10_000 });
  const h = await rt.evaluate(call("Hear", [{ value: s }]), c("Context", c("Execution"), c("Code", c("TypeScript"))));
  const roots = h.args.filter((a) => a.name === undefined);
  if (roots.length > 1 && ![...seen].some((x) => s.includes(x))) {
    seen.add(s);
    shown++;
    console.log(`--- ${s.slice(0, 200).replace(/\n/g, " ")}\n    ${format({ head: "Phrases", args: roots }).slice(0, 400)}`);
  }
}
