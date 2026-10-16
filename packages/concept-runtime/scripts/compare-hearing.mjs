// The two hearings on the same conversations: the rules (Hear()) alone, and frames first
// (src/frame/frames.ts) with the rules as fallback. Run after `pnpm build`.
//
//   node scripts/compare-hearing.mjs [--show]
//
// Each case is a conversation in eval/frames/cases.json, on a fresh graph with the fixture's
// facts (what a Wikidata import would have stored), and an answer is right when what is said
// contains what is expected (or matches it, "re:") and none of what is not expected ("expectNot"). --show prints every turn.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { c, format, parse } from "../dist/concept/expression.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { turn } from "../dist/runtime/turn.js";
import { ConversationRepository } from "../dist/memory/conversations.js";
import { seed } from "../dist/seed/seed.js";
import { ConceptStore } from "../dist/store/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { fixture, cases } = JSON.parse(readFileSync(join(root, "eval/frames/cases.json"), "utf8"));
const show = process.argv.includes("--show");

async function run(hearing, said) {
  const store = new ConceptStore();
  seed(store, { packs: [] });
  for (const [id, rel] of fixture) store.addRelation(id, parse(rel));
  const runtime = new Runtime(store, {});
  // A conversation recorded the way the command line records one, so what was said is remembered.
  const conversations = new ConversationRepository(store);
  const conversation = conversations.create(false).id;
  const history = [];
  const out = [];
  for (const message of said) {
    const t0 = performance.now();
    const heard = conversations.receive();
    runtime.trace.said(heard.seq);
    const t = await turn(runtime, message, c("Execution"), { history: history.slice(-6), conversation, learn: false, keepReadings: true, hearing });
    conversations.record(conversation, { message, ...(t.expression === undefined ? {} : { parsed: t.expression }), result: t.result ?? t.rendered, ...(t.spoken === undefined ? {} : { spoken: t.spoken }), heard });
    history.push({ message, result: t.result === undefined ? t.rendered : format(t.result), spoken: t.spoken });
    out.push({ spoken: t.spoken, by: t.hearingUsed ?? "rules", ms: performance.now() - t0 });
  }
  return out;
}

// An expectation is a substring, or a regular expression when written "re:...", read case-insensitively.
// "expectNot" (per turn, a string or a list of them, same forms) names what must not be said.
const found = (spoken, what) => (what.startsWith("re:") ? new RegExp(what.slice(3), "i").test(spoken) : spoken.toLowerCase().includes(what.toLowerCase()));
const right = (spoken, expected, not = []) => found(spoken, expected) && [not].flat().every((n) => !n || !found(spoken, n));
const totals = { rules: 0, frames: 0, byFrames: 0, turns: 0 };
const groups = {};
for (const k of cases) {
  const rules = await run("rules", k.say);
  const framed = await run("frames", k.say);
  k.say.forEach((message, i) => {
    const r = right(rules[i].spoken, k.expect[i], k.expectNot?.[i]);
    const f = right(framed[i].spoken, k.expect[i], k.expectNot?.[i]);
    totals.turns += 1;
    totals.rules += r;
    totals.frames += f;
    totals.byFrames += framed[i].by === "frames";
    const g = (groups[k.group] ??= { turns: 0, rules: 0, frames: 0 });
    g.turns += 1;
    g.rules += r;
    g.frames += f;
    if (show || r !== f || process.env.FALLBACKS && framed[i].by !== "frames") {
      console.log(`${r ? "ok " : "NO "} ${f ? "ok " : "NO "} ${message}`);
      console.log(`        rules:  ${rules[i].spoken}`);
      console.log(`        frames: ${framed[i].spoken}   (${framed[i].by}, ${framed[i].ms.toFixed(0)} ms)`);
    }
  });
}
console.log("\ngroup        turns  rules  frames");
for (const [name, g] of Object.entries(groups)) console.log(`${name.padEnd(12)} ${String(g.turns).padStart(5)}  ${String(g.rules).padStart(5)}  ${String(g.frames).padStart(6)}`);
console.log(`${"all".padEnd(12)} ${String(totals.turns).padStart(5)}  ${String(totals.rules).padStart(5)}  ${String(totals.frames).padStart(6)}`);
console.log(`\nframes read ${totals.byFrames} of ${totals.turns} turns itself; the rest fell back to the rules.`);
