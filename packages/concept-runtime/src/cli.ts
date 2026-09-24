#!/usr/bin/env node
/**
 * napkin — one turn, end to end, with the trace visible.
 *
 *   napkin "What is 5 times three?"
 *   napkin --expr 'What(Multiply(5, Number("three")))'
 *   napkin --seed
 *   napkin --ground [layers dir]
 */
import { dirname, resolve } from "node:path";
import { c, format, parse } from "./concept/expression.js";
import { modelAvailable } from "./ears/ollama.js";
import { Runtime } from "./runtime/evaluator.js";
import { evidenceStoreFor } from "./runtime/evidence.js";
import { describeAgenda, exist } from "./runtime/exist.js";
import { turn } from "./runtime/turn.js";
import { study } from "./learn/study.js";
import { curriculum, EVERYDAY, TRACKS } from "./learn/curriculum.js";
import { forget } from "./store/forget.js";
import { seed } from "./seed/seed.js";
import { DATA, groundAll } from "./seed/grounding/layer.js";
import { load, save } from "./store/persist.js";
import { ConceptStore } from "./store/store.js";
import { appendTrace } from "./store/traces.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Learning that does not survive a restart is not learning. */
const graphPath = value("--graph") ?? `${process.env.HOME}/.napkin/graph.json`;
const store = new ConceptStore();
// Load before seeding. A snapshot can hold an older copy of a seeded realization, and
// since a newer realization shadows an older one with the same pattern and context,
// seeding last is what makes the current definition win.
const loaded = flag("--fresh") ? 0 : load(store, graphPath);
const report = seed(store);
// The third store, beside the graph it joins to by `saidSeq` (concept-spec Part 13).
const tracePath = resolve(dirname(graphPath), "trace.jsonl");
const runtime = new Runtime(store, { tracePath });
const context = c("Execution");
const persist = () => (flag("--fresh") ? 0 : save(store, graphPath));
/** This run's events, appended once the turn is done, so evidence survives a restart. */
const persistTrace = () => {
  if (flag("--fresh")) return;
  const events = runtime.trace.all();
  appendTrace(tracePath, events);
  evidenceStoreFor(tracePath).append(events);
};

if (flag("--seed")) {
  persist();
  console.log(
    `seeded ${report.created} Concepts, ${report.realizations} realizations, ` +
      `${report.synonymsDerived} synonym forwardings derived; ` +
      `${loaded} loaded from disk; graph holds ${store.size()}\n${graphPath}`,
  );
  process.exit(0);
}

// Grounding is a request, not a seed step: the layers are thousands of Concepts under
// licenses the user chose to take on (seed/grounding/README.md). Once grounded they persist
// in the graph like anything else.
if (flag("--ground")) {
  const given = value("--ground");
  for (const r of groundAll(store, given && !given.startsWith("--") ? given : `${DATA}/layers`)) {
    console.log(`${r.source}: ${r.added} relations from #${r.importSeq}, ${r.withheld.length} IsA withheld`);
    for (const w of r.withheld) console.log(`  withheld ${w.identity} ${w.claim} (${w.realizations} realizations)`);
  }
  persist();
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
    ["--graph", "--limit", "--depth", "--model", "--endpoint", "--track", "--as", "--from"]
      .map(value)
      .filter(Boolean),
  );
  const track = flag("--everyday") ? EVERYDAY : value("--track");
  const topics = track
    ? curriculum(track)
    : args.filter((a) => !a.startsWith("--") && !consumed.has(a));
  if (!topics.length) {
    console.error(
      'Nothing to study.\n' +
        '  napkin --study money debt "medium of exchange"\n' +
        `  napkin --study --track economics        tracks: ${TRACKS.join(", ")}, all`,
    );
    process.exit(1);
  }
  // Documents to learn from, rather than the web. A directory takes every .md inside it.
  const from = value("--from");
  let reading: { name: string; text: string }[] = [];
  if (from) {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = statSync(from).isDirectory()
      ? readdirSync(from).filter((f) => /\.(md|txt)$/.test(f)).map((f) => join(from, f))
      : [from];
    reading = files.map((f) => ({ name: f.split("/").pop() ?? f, text: readFileSync(f, "utf8") }));
    console.log(`reading ${reading.length} document(s) from ${from}`);
  }

  const limit = Number(value("--limit") ?? 25);
  const depth = Number(value("--depth") ?? 2);
  const before = store.size();
  const what = track ? `track ${track} (${topics.length} topics)` : topics.join(", ");
  const facet = value("--as");
  console.log(
    facet
      ? `expressing ${what} in ${facet} — up to ${limit} Concepts\n`
      : `studying ${what} — up to ${limit} Concepts, depth ${depth}\n`,
  );
  const result = await study(runtime, topics, {
    maxConcepts: limit,
    maxDepth: depth,
    as: value("--as"),
    research: !flag("--no-research"),
    reading,
    onStep: (s) => {
      const mark = { taught: "+", attached: "&", known: "=", read: ".", refused: "~", failed: "!" }[s.how];
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

const importing = value("--import");
if (importing) {
  const { readFileSync } = await import("node:fs");
  const { importTypeScript } = await import("./code/import.js");
  const result = importTypeScript(readFileSync(importing, "utf8"), importing);
  console.log(format(result.expression));
  if (result.unsupported.length) {
    console.error(`\n${result.unsupported.length} node(s) with no mapping:`);
    for (const u of result.unsupported) console.error(`  ${u.kind}  ${u.source.replace(/\s+/g, " ")}`);
  }
  process.exit(0);
}

const message = args.filter((a) => !a.startsWith("--") && a !== expr).join(" ");

const show = (label: string, body: string) => console.log(`\n\x1b[1m${label}\x1b[0m\n${body}`);

if (flag("--evidence")) {
  const name = args[args.indexOf("--evidence") + 1];
  if (!name) {
    console.error("napkin --evidence <Concept>       counts by context, e.g. napkin --evidence Multiply");
    process.exit(1);
  }
  const result = await runtime.evaluate(parse(`Evidence(${name}())`), context);
  show(`evidence for ${name}`, format(result));
  process.exit(0);
}

if (expr) {
  const parsed = parse(expr);
  const result = await runtime.evaluate(parsed, context);
  show("parsed", format(parsed));
  show("result", format(result));
  show("trace", runtime.trace.render());
  persistTrace();
} else if (message) {
  if (!(await modelAvailable())) {
    console.error("No local model reachable at http://127.0.0.1:11434 — start Ollama, or use --expr.");
    process.exit(1);
  }
  // The same options the studio builds, so a question answers the same either way.
  const t = await turn(runtime, message, context, {
    learn: !flag("--no-learn"),
    ...(value("--model") === undefined ? {} : { model: value("--model")! }),
    ...(value("--endpoint") === undefined ? {} : { endpoint: value("--endpoint")! }),
  });
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
  persistTrace();
  if (t.learned.length) show("graph", `${grew} Concepts saved to ${graphPath}`);
  show("trace", runtime.trace.render());
} else {
  console.log(`napkin — usage:
  napkin "What is 5 times three?"        hear a message, then realize it
  napkin --expr 'Add(2, 3)'             realize an expression directly
  napkin "what is chess?"               learning is on; --no-learn to answer from the graph alone
  napkin --model qwen3.5:9b "..."       parse with a different local model
  napkin --study money debt             learn topics, and whatever they turn out to need
  napkin --study --track economics      learn a whole curriculum track
  napkin --study --everyday             the whole everyday world, foundations first
  napkin --study If Add --as TypeScript teach existing Concepts to emit a language
  napkin --study money --limit 200 --depth 4    a long run; saves as it goes
  napkin --study --track napkin --from .agents/planning/2026-09-16-concept-ai-system/design
                                         learn its own vocabulary from its own specs
  napkin --import src/thing.ts          read TypeScript as Concept expressions
  napkin --agenda                       what it would work on next, unprompted
  napkin --evidence Multiply            counts by context, from the persisted trace
  napkin --exist                        work on that agenda, bounded by --budget
  napkin --forget                       what would be forgotten (--commit to apply)
  napkin --seed                         seed a graph and report
  napkin --fresh ...                    do not load or save the persistent graph
  napkin --graph <path> ...             use a different graph file

The graph lives at ~/.napkin/graph.json and grows as the system learns.`);
}
