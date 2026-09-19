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
import { describeAgenda, exist } from "./runtime/exist.js";
import { turn } from "./runtime/turn.js";
import { study } from "./learn/study.js";
import { curriculum, TRACKS } from "./learn/curriculum.js";
import { forget } from "./store/forget.js";
import { seed } from "./seed/seed.js";
import { load, save } from "./store/persist.js";
import { ConceptStore } from "./store/store.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Learning that does not survive a restart is not learning. */
const graphPath = value("--graph") ?? `${process.env.HOME}/.cnocept/graph.json`;
const store = new ConceptStore();
// Load before seeding. A snapshot can hold an older copy of a seeded realization, and
// since a newer realization shadows an older one with the same pattern and context,
// seeding last is what makes the current definition win.
const loaded = flag("--fresh") ? 0 : load(store, graphPath);
const report = seed(store);
const runtime = new Runtime(store);
const context = c("Execution");
const persist = () => (flag("--fresh") ? 0 : save(store, graphPath));

if (flag("--seed")) {
  persist();
  console.log(
    `seeded ${report.created} Concepts, ${report.realizations} realizations, ` +
      `${report.synonymsDerived} synonym forwardings derived; ` +
      `${loaded} loaded from disk; graph holds ${store.size()}\n${graphPath}`,
  );
  process.exit(0);
}

if (flag("--agenda")) {
  console.log(describeAgenda(runtime));
  process.exit(0);
}

if (flag("--forget")) {
  const dryRun = !flag("--commit");
  const gone = forget(store, { dryRun, unusedForMs: Number(value("--unused-days") ?? 30) * 86_400_000 });
  if (!dryRun) persist();
  console.log(
    gone.length
      ? `${gone.length} realization(s) ${dryRun ? "would be" : "were"} forgotten:\n` +
          gone.map((g) => `  ${g.identity}  ${g.pattern}  [${g.context}]  ${g.reason}`).join("\n") +
          (dryRun ? "\n\nre-run with --commit to apply" : "")
      : "nothing to forget — an only-way-to-do-something is never collected",
  );
  process.exit(0);
}

if (flag("--exist")) {
  const budget = Number(value("--budget") ?? 4);
  console.log(`existing, budget ${budget}\n`);
  const done = await exist(runtime, {
    budget,
    restMs: 250,
    onIntent: (intent, outcome) => console.log(`${intent.what} ${intent.identity}\n  why: ${intent.why}\n  did: ${outcome}\n`),
  });
  persist();
  console.log(done.length ? `${done.length} intent(s) worked; graph holds ${store.size()}` : "nothing to do");
  process.exit(0);
}

const expr = value("--expr");

if (flag("--study")) {
  if (!(await modelAvailable())) {
    console.error("No local model reachable at http://127.0.0.1:11434 — start Ollama.");
    process.exit(1);
  }
  // Every bare word is a topic; the flag values are not.
  const consumed = new Set(
    ["--graph", "--limit", "--depth", "--model", "--track"].map(value).filter(Boolean),
  );
  const track = value("--track");
  const topics = track
    ? curriculum(track)
    : args.filter((a) => !a.startsWith("--") && !consumed.has(a));
  if (!topics.length) {
    console.error(
      'Nothing to study.\n' +
        '  cnocept --study money debt "medium of exchange"\n' +
        `  cnocept --study --track economics        tracks: ${TRACKS.join(", ")}, all`,
    );
    process.exit(1);
  }
  const limit = Number(value("--limit") ?? 25);
  const depth = Number(value("--depth") ?? 2);
  const before = store.size();
  const what = track ? `track ${track} (${topics.length} topics)` : topics.join(", ");
  console.log(`studying ${what} — up to ${limit} Concepts, depth ${depth}\n`);
  const result = await study(runtime, topics, {
    maxConcepts: limit,
    maxDepth: depth,
    research: !flag("--no-research"),
    onStep: (s) => {
      const mark = { taught: "+", known: "=", refused: "~", failed: "!" }[s.how];
      console.log(`${mark} ${"  ".repeat(s.depth)}${s.identity}  ${s.detail.slice(0, 120)}`);
      if (s.discovered.length) {
        console.log(`  ${"  ".repeat(s.depth)}\x1b[2m-> ${s.discovered.join(" ")}\x1b[0m`);
      }
    },
    // Save as it goes: an overnight run that dies at hour six should keep hours one to five.
    onProgress: () => persist(),
  });
  persist();
  console.log(
    `\n${result.taught} taught, ${result.visited} visited; graph went ${before} -> ${store.size()}` +
      (result.remaining.length ? `\nstill queued: ${result.remaining.slice(0, 20).join(" ")}` : ""),
  );
  process.exit(0);
}

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
  const grew = persist();
  if (t.learned.length) show("graph", `${grew} Concepts saved to ${graphPath}`);
  show("trace", runtime.trace.render());
} else {
  console.log(`cnocept — usage:
  cnocept "What is 5 times three?"        hear a message, then realize it
  cnocept --expr 'Add(2, 3)'             realize an expression directly
  cnocept --learn "what is chess?"       close gaps by learning before answering
  cnocept --study money debt             learn topics, and whatever they turn out to need
  cnocept --study --track economics      learn a whole curriculum track
  cnocept --study money --limit 200 --depth 4    a long run; saves as it goes
  cnocept --agenda                       what it would work on next, unprompted
  cnocept --exist                        work on that agenda, bounded by --budget
  cnocept --forget                       what would be forgotten (--commit to apply)
  cnocept --seed                         seed a graph and report
  cnocept --fresh ...                    do not load or save the persistent graph
  cnocept --graph <path> ...             use a different graph file

The graph lives at ~/.cnocept/graph.json and grows as the system learns.`);
}
