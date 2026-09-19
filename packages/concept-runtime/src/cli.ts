#!/usr/bin/env node
/**
 * cnocept — one turn, end to end, with the trace visible.
 *
 *   cnocept "What is 5 times three?"
 *   cnocept --expr 'What(Multiply(5, Number("three")))'
 *   cnocept --seed
 */
import { c, format, parse } from "./concept/expression.js";
import { modelAvailable } from "./ears/ollama.js";
import { Runtime } from "./runtime/evaluator.js";
import { turn } from "./runtime/turn.js";
import { seed } from "./seed/seed.js";
import { ConceptStore } from "./store/store.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const store = new ConceptStore();
const report = seed(store);
const runtime = new Runtime(store);
const context = c("Execution");

if (flag("--seed")) {
  console.log(
    `seeded ${report.created} Concepts, ${report.realizations} realizations, ` +
      `${report.synonymsDerived} synonym forwardings derived; graph holds ${store.size()}`,
  );
  process.exit(0);
}

const expr = value("--expr");
const message = args.filter((a) => !a.startsWith("--") && a !== expr).join(" ");

const show = (label: string, body: string) => console.log(`\n\x1b[1m${label}\x1b[0m\n${body}`);

if (expr) {
  const parsed = parse(expr);
  const result = await runtime.evaluate(parsed, context);
  show("parsed", format(parsed));
  show("result", format(result));
  show("trace", runtime.trace.render());
} else if (message) {
  if (!(await modelAvailable())) {
    console.error("No local model reachable at http://127.0.0.1:11434 — start Ollama, or use --expr.");
    process.exit(1);
  }
  const t = await turn(runtime, message, context, { learn: flag("--learn") });
  show("message", t.heard.message);
  show("heard", t.heard.raw.trim());
  show("parsed", t.parsed ?? "(nothing)");
  show("result", t.rendered);
  if (t.heard.problems.length) show("checks failed", t.heard.problems.join("\n"));
  if (t.heard.rejected.length)
    show("lines rejected", t.heard.rejected.map((r) => `${r.line}  <-- ${r.reason}`).join("\n"));
  if (t.learned.length)
    show("learned", t.learned.map((l) => `${l.how}: ${l.identity} — ${l.detail}`).join("\n"));
  if (t.gaps.length)
    show("gaps — the learning queue", t.gaps.map((g) => `${g.kind}: ${g.expression}`).join("\n"));
  if (t.ambiguities.length) show("ambiguities", t.ambiguities.join("\n"));
  show("trace", runtime.trace.render());
} else {
  console.log(`cnocept — usage:
  cnocept "What is 5 times three?"        hear a message, then realize it
  cnocept --expr 'Add(2, 3)'             realize an expression directly
  cnocept --learn "what is chess?"       close gaps by learning before answering
  cnocept --seed                         seed a graph and report`);
}
