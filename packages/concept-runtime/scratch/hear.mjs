// node scratch/hear.mjs <TypeScript|Python> <file-or-text>
import { existsSync, readFileSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { importTypeScript, importSource } from "../dist/code/import.js";
import { c, call, format } from "../dist/concept/expression.js";
const store = new ConceptStore();
seed(store);
const [lang, arg] = process.argv.slice(2);
const text = existsSync(arg) ? readFileSync(arg, "utf8") : arg.replace(/\\n/g, "\n");
const rt = new Runtime(store, { maximumSteps: 50_000_000, maximumDepth: 10_000 });
const h = await rt.evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c(lang))));
console.log("heard:", format(h));
try {
  const r = await rt.evaluate(h, c("Context", c("Code", c(lang)), c("Reading")));
  console.log("read: ", format(r));
} catch (e) {
  console.log("read error:", e.message, e.stack.split("\n").slice(0, 4).join("\n"));
}
const ref = lang === "TypeScript" ? importTypeScript(text) : await importSource(text, "Python");
console.log("ref:  ", format(ref.expression));
