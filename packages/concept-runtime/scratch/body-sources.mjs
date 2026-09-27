// SPIKE: which hearing body a profile's `(anon) :3:<column>` is. Prints, for each Hearing,
// Sensing and CodeView body, the columns where its functions start in the JavaScript that runs.
//   node scratch/body-sources.mjs [column ...]
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { format, isCall } from "../dist/concept/expression.js";

const store = new ConceptStore();
seed(store);
const rt = new Runtime(store);
const cols = process.argv.slice(2).map(Number);
for (const u of store.all()) {
  for (const r of u.realizations) {
    const ctx = r.context === undefined ? "" : format(r.context);
    if (!/Hearing\(Code|Sensing|Execution\(\), Code/.test(ctx) || !isCall(r.body) || r.body.head !== "Code") continue;
    const source = rt.sourceOf(r.body);
    const line = `return (${source})(args, bindings, api);`.split("\n")[0];
    const lines = `return (${source})(args, bindings, api);`.split("\n");
    const hits = cols.map((c) => `${c}: ${(lines[0] ?? "").slice(c, c + 60).replace(/\s+/g, " ")}`);
    console.log(`${u.identity} ${ctx} lines=${lines.length} len2=${(lines[0] ?? "").length}${hits.length ? "\n   " + hits.join("\n   ") : ""}`);
  }
}
