// Napkin against the real sources, for what the sandbox it is developed in cannot reach. Run by
// .github/workflows/live-probe.yml (or locally, with a network): each conversation on a fresh
// graph, learning on, every reply printed with what was looked up, why it was read so, and where
// its answer came from. NAPKIN_PROBE gives other conversations: messages split by " | ",
// conversations by " || ".
import { ConceptStore } from "../dist/store/store.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { turn } from "../dist/runtime/turn.js";
import { seed } from "../dist/seed/seed.js";
import { ConversationRepository } from "../dist/memory/conversations.js";
import { c, format } from "../dist/concept/expression.js";
import { knownFrom, sourcesOf } from "../dist/store/provenance.js";

const BUILT_IN = [
  ["Can you help me build a web app?", "What is build?", "What is an app?", "What is a “web app”?"],
  ["I am working out at the gym", "What is build?"],
  ["what is chess?", "who directed jaws", "what year was he born"],
  ["why is the sky blue?", "why do cats purr?"],
  ["My car broke down :(", "I lost my job", "hi"],
  ["my birthday is march 5 1991", "bday means birthday", "what is my bday"],
  ["what is the capital of france", "how many people live there"],
];
const given = (process.env.NAPKIN_PROBE ?? "").trim();
const conversations = given ? given.split(" || ").map((k) => k.split(" | ").map((m) => m.trim()).filter(Boolean)) : BUILT_IN;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`timed out after ${ms} ms`)), ms))]);

for (const say of conversations) {
  const store = new ConceptStore();
  seed(store);
  const repo = new ConversationRepository(store);
  const { id } = repo.create();
  const history = [];
  console.log(`\n======== ${say.join(" | ")}`);
  for (const message of say) {
    const runtime = new Runtime(store, {});
    const heard = repo.receive();
    runtime.trace.said(heard.seq);
    const began = Date.now();
    let t;
    try {
      t = await withTimeout(turn(runtime, message, c("Execution"), { history: history.slice(-6), conversation: id }), 90_000);
    } catch (error) {
      console.log(`> ${message}\n  ERROR ${error.message}`);
      continue;
    }
    repo.record(id, { message, ...(t.expression ? { parsed: t.expression } : {}), result: t.result ?? t.rendered, heard });
    history.push({ message, result: t.result === undefined ? t.rendered : format(t.result), spoken: t.spoken });
    console.log(`> ${message}`);
    console.log(`< ${t.spoken}`);
    console.log(`  (${Date.now() - began} ms, ${t.hearingUsed ?? "rules"}) heard: ${format(t.expression ?? "").slice(0, 200)}`);
    for (const w of t.why ?? []) console.log(`  why: ${w}`);
    for (const l of t.learned ?? []) console.log(`  learned: ${l.identity} [${l.how}] ${String(l.detail).slice(0, 200)}`);
    for (const f of knownFrom(store, t.result, t.expression)) console.log(`  from: ${f}`);
    for (const s of sourcesOf(store, t.result, t.expression)) console.log(`  source: ${s.label} ${s.url}`);
    if (process.env.NAPKIN_PROBE_DETAIL) {
      console.log(`  pointed: ${runtime.context.get("pointed") ?? "-"}`);
      const heads = new Set();
      const walk = (e) => { if (e && typeof e === "object" && "head" in e) { heads.add(e.head); for (const a of e.args) walk(a.value); } };
      walk(t.result); walk(t.expression);
      for (const h of [...heads].filter((h) => store.get(h) && !store.get(h).realizations.length).slice(0, 6)) {
        const rs = store.get(h).relations.filter((r) => !r.stamps?.[0]?.pack).map((r) => format(r.claim) + (r.context ? ` [in ${format(r.context)}]` : ""));
        if (rs.length) console.log(`  facts ${h}: ${rs.slice(0, 12).join("; ").slice(0, 600)}`);
      }
    }
  }
}
// 2026-10-13T14:23:50Z
