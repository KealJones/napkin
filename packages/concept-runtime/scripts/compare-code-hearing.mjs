// Code heard word by word (packs/code-hearing.ncon) beside the readers (code/import.ts, tree-sitter),
// on the code the tests read: how many programs hearing reads as the readers do, and where it does
// not. The step before switching readCode over where they agree (tasks/todo.md, item 24).
//
//   node scripts/compare-code-hearing.mjs
import { readFileSync, readdirSync } from "node:fs";
import { ConceptStore } from "../dist/store/store.js";
import { seed } from "../dist/seed/seed.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { c, call, format, isCall } from "../dist/concept/expression.js";
import { importSource } from "../dist/code/import.js";

const store = new ConceptStore();
seed(store);
const read = async (text, language) => {
  const heard = await new Runtime(store).evaluate(call("Hear", [{ value: text }]), c("Context", c("Execution"), c("Code", c(language))));
  return new Runtime(store).evaluate(heard, c("Context", c("Code", c(language)), c("Reading")));
};
// The readers write every name a program does not bind as $name; hearing writes UnboundName("name").
const asReaders = (e) => (!isCall(e) ? e : e.head === "UnboundName" && e.args.length === 1 && typeof e.args[0].value === "string" ? { variable: e.args[0].value } : { head: e.head, args: e.args.map((a) => ({ ...a, value: asReaders(a.value) })) });

// Every fenced block and every quoted program in the code tests.
const programs = [];
for (const f of readdirSync("src/code").filter((f) => f.endsWith(".test.ts"))) {
  const text = readFileSync(`src/code/${f}`, "utf8");
  for (const m of text.matchAll(/```(\w+)?\\n([\s\S]*?)```/g)) programs.push({ from: f, language: /py/.test(m[1] ?? "") ? "Python" : "TypeScript", code: m[2].replace(/\\n/g, "\n") });
  for (const m of text.matchAll(/"((?:function|for|if|const|let|while|class|return) [^"\\]{4,200})"/g)) programs.push({ from: f, language: "TypeScript", code: m[1] });
  for (const m of text.matchAll(/"((?:def|for|if|while|class) [^"]{4,200}?)"/g)) if (m[1].includes("\\n")) programs.push({ from: f, language: "Python", code: m[1].replace(/\\n/g, "\n") });
}
const seen = new Set();
let same = 0, differ = 0, failed = 0;
const notes = [];
for (const p of programs) {
  const key = p.language + p.code;
  if (seen.has(key)) continue;
  seen.add(key);
  let reader;
  try {
    const r = await importSource(p.code, p.language);
    if (!r || r.unsupported.length) continue;
    reader = format(r.expression);
  } catch {
    continue;
  }
  let heard;
  try {
    heard = format(asReaders(await read(p.code, p.language)));
  } catch (e) {
    failed++;
    notes.push(`failed  ${p.language} ${JSON.stringify(p.code).slice(0, 80)}: ${String(e).slice(0, 80)}`);
    continue;
  }
  if (heard === reader) same++;
  else {
    differ++;
    notes.push(`differs ${p.language} ${JSON.stringify(p.code).slice(0, 80)}`);
  }
}
console.log(notes.join("\n"));
console.log(`\n${same + differ + failed} programs the readers read whole: hearing reads ${same} the same, ${differ} differently, ${failed} not at all.`);
