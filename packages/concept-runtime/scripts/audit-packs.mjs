// What each pack is worth, measured: how often prompts use it, what changes without it, how big it
// is, and where it holds word lists. Run after `pnpm build`:
//
//   node scripts/audit-packs.mjs [--quick]       writes eval/packs/audit.json and prints a table
//
// Prompts: the hearing gold cases, the novel-prompt research set, the frames comparison
// conversations (with their fixture) and the unseen probes below. Ablation removes one pack, and
// every pack that requires it, and counts the turns whose answer changes, and the frames cases
// whose expected answer is lost.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN_PACKS, loadPacks, realizationExpr, seedPacks } from "../dist/code/ncon.js";
import { c, format, parse } from "../dist/concept/expression.js";
import { ConversationRepository } from "../dist/memory/conversations.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { turn } from "../dist/runtime/turn.js";
import { deriveFolds, deriveSynonymForwarding } from "../dist/seed/seed.js";
import { ConceptStore } from "../dist/store/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..", "..");
const quick = process.argv.includes("--quick");
const packs = loadPacks([BUILT_IN_PACKS]);

// The conversations.
const frames = JSON.parse(readFileSync(join(root, "eval/frames/cases.json"), "utf8"));
const ears = JSON.parse(readFileSync(join(root, "eval/ears/cases.json"), "utf8")).map((k) => ({ say: [k.message] }));
const novel = Object.values(JSON.parse(readFileSync(join(repo, ".agents/planning/2026-09-16-concept-ai-system/research/novel-prompts/prompts.json"), "utf8"))).flat().map((m) => ({ say: [m] }));
const probes = [
  ["whats 144 divided by 12", "what is 3 squared", "how many days until christmas", "my dog is named rex", "what is my dog named", "my brother lives in seattle", "where does my brother live", "i work at google", "where do i work", "tom is 30", "how old is tom", "what is 2 to the power of 8", "thanks", "remember to buy milk"],
  ["hello", "how are you", "what time is it", "what day is it", "who are you", "what can you do", "tell me a joke", "i'm sad", "my car broke down and i'm really annoyed", "good night"],
  ["is a penguin a bird", "why is the sky blue", "write a haiku about rain", "what is the weather in tokyo", "explain this code: `function add(a, b) { return a + b }`", "fix this `if (x = 5) { go() }`", "run `function f(n) { return n * 2 }` with 21"],
].map((say) => ({ say }));
const conversations = [...frames.cases.map((k) => ({ say: k.say, expect: k.expect })), ...ears, ...novel, ...probes];
const turns = conversations.reduce((n, k) => n + k.say.length, 0);

function storeWithout(removed) {
  const store = new ConceptStore();
  seedPacks(store, packs.filter((p) => !removed.has(p.name)));
  deriveSynonymForwarding(store);
  deriveFolds(store);
  for (const [id, rel] of frames.fixture) store.addRelation(id, parse(rel));
  return store;
}

/** Packs that require this one, through their requirements. */
function dependents(name) {
  const out = new Set([name]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of packs) if (!out.has(p.name) && p.requires.some((r) => out.has(r))) out.add(p.name), (grew = true);
  }
  return out;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);

async function run(removed, usage) {
  const answers = [];
  let expectedKept = 0;
  let expectedTotal = 0;
  for (const k of conversations) {
    const store = storeWithout(removed);
    const owner = new Map();
    // A realization by its pattern and context, as the trace names it (Realization(pattern=..., context=...)).
    const keyOf = (pattern, context) => `${format(pattern)} | ${context === undefined ? "" : format(context)}`;
    if (usage) for (const u of store.all()) for (const r of u.realizations) owner.set(keyOf(r.pattern, r.context), r.seededFrom ?? "derived");
    const repo = new ConversationRepository(store);
    const conversation = repo.create(false).id;
    const history = [];
    for (const [i, message] of k.say.entries()) {
      const runtime = new Runtime(store, {});
      const heard = repo.receive();
      runtime.trace.said(heard.seq);
      let t;
      try {
        t = await withTimeout(turn(runtime, message, c("Execution"), { history: history.slice(-6), conversation, learn: false }), 8000);
      } catch (error) {
        t = { spoken: `(error: ${error.message})` };
      }
      const spoken = t?.spoken ?? "(timed out)";
      answers.push(spoken);
      if (k.expect && k.expect[i] !== undefined && k.expect[i] !== "") {
        expectedTotal += 1;
        if (spoken.toLowerCase().includes(k.expect[i].toLowerCase())) expectedKept += 1;
      }
      if (t?.result !== undefined) {
        repo.record(conversation, { message, ...(t.expression === undefined ? {} : { parsed: t.expression }), result: t.result ?? t.rendered, spoken, heard });
        history.push({ message, result: format(t.result), spoken });
      }
      if (usage) {
        const seen = new Set();
        for (const e of runtime.trace.all()) {
          if (!e.selectedRealization) continue;
          const sr = e.selectedRealization;
          const arg = (n) => sr.args?.find((a) => a.name === n)?.value;
          const pack = owner.get(keyOf(arg("pattern") ?? sr.args?.[0]?.value, arg("context"))) ?? "derived";
          const u = (usage[pack] ??= { selections: 0, realizations: new Set(), turns: 0 });
          u.selections += 1;
          u.realizations.add(format(e.selectedRealization).slice(0, 120));
          seen.add(pack);
        }
        for (const p of seen) usage[p].turns += 1;
      }
    }
  }
  return { answers, expectedKept, expectedTotal };
}

// Word lists and regexes of words in a pack's code: meaning decided by a list (AGENTS.md).
function smells(text) {
  const lists = text.match(/List\(\s*"[a-z][a-z' ]*"(?:,\s*"[a-z][a-z' ]*"){3,}/g) ?? [];
  const regexes = text.match(/"[^"\n]*\\\\b\(\?:?[a-z]+\|[a-z]+\|[a-z]+[^"\n]*"/g) ?? [];
  return { wordLists: lists.length, wordRegexes: regexes.length, examples: [...lists, ...regexes].slice(0, 3).map((s) => s.slice(0, 90)) };
}

const t0 = Date.now();
const usage = {};
const base = await run(new Set(), usage);
console.error(`baseline: ${turns} turns in ${((Date.now() - t0) / 1000).toFixed(0)} s, expected kept ${base.expectedKept}/${base.expectedTotal}`);

// --alone a,b: each pack removed by itself, its dependents kept, with the answers that changed:
// what the pack does itself, where its dependents would hide it.
const alone = process.argv.find((a) => a.startsWith("--alone="))?.slice("--alone=".length);
if (alone) {
  const said = conversations.flatMap((k) => k.say);
  for (const name of alone.split(",")) {
    const without = await run(new Set([name]));
    const changed = without.answers.map((a, i) => [said[i], base.answers[i], a]).filter(([, b, a]) => a !== b);
    console.log(`\nwithout ${name} alone: ${changed.length} answers changed, ${base.expectedKept - without.expectedKept} expected lost`);
    for (const [m, b, a] of changed.slice(0, 12)) console.log(`  ${JSON.stringify(m)}\n    with:    ${b.slice(0, 140)}\n    without: ${a.slice(0, 140)}`);
  }
  process.exit(0);
}

const rows = [];
for (const p of packs) {
  const text = readFileSync(join(BUILT_IN_PACKS, `${p.name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}.ncon`), "utf8").toString();
  const removed = dependents(p.name);
  let changed;
  let lost;
  if (!quick) {
    const without = await run(removed);
    changed = without.answers.filter((a, i) => a !== base.answers[i]).length;
    lost = base.expectedKept - without.expectedKept;
    console.error(`  without ${p.name} (+${removed.size - 1} requiring it): ${changed} answers changed, ${lost} expected lost`);
  }
  const u = usage[p.name];
  rows.push({
    pack: p.name,
    lines: text.split("\n").length,
    concepts: p.units.length,
    realizations: p.units.reduce((n, x) => n + x.realizations.length, 0),
    code: (text.match(/Code\(/g) ?? []).length,
    selections: u?.selections ?? 0,
    realizationsUsed: u?.realizations.size ?? 0,
    turnsTouched: u?.turns ?? 0,
    requiredBy: [...removed].filter((n) => n !== p.name),
    changedWithout: changed,
    expectedLostWithout: lost,
    ...smells(text),
  });
}
mkdirSync(join(root, "eval/packs"), { recursive: true });
writeFileSync(join(root, "eval/packs/audit.json"), JSON.stringify({ turns, baseline: { expectedKept: base.expectedKept, expectedTotal: base.expectedTotal }, derived: usage.derived && { selections: usage.derived.selections, turns: usage.derived.turns }, rows }, null, 2));
console.log(`pack            lines  units  real  code  used/real  sel    turns  changed  lost  lists  regex  requiredBy`);
for (const r of rows.sort((a, b) => b.turnsTouched - a.turnsTouched)) {
  console.log(`${r.pack.padEnd(14)} ${String(r.lines).padStart(6)} ${String(r.concepts).padStart(6)} ${String(r.realizations).padStart(5)} ${String(r.code).padStart(5)} ${String(r.realizationsUsed).padStart(5)}/${String(r.realizations).padEnd(4)} ${String(r.selections).padStart(6)} ${String(r.turnsTouched).padStart(6)}  ${String(r.changedWithout ?? "-").padStart(7)} ${String(r.expectedLostWithout ?? "-").padStart(5)} ${String(r.wordLists).padStart(6)} ${String(r.wordRegexes).padStart(6)}  ${r.requiredBy.join(",")}`);
}
console.log(`\n${turns} turns; ${((Date.now() - t0) / 60000).toFixed(1)} min`);
