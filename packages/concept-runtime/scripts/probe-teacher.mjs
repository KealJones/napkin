// The teacher live (live-probe, test=scripts/probe-teacher.mjs): every real source first, Gemini
// last; what was taught, and what Napkin then says from it. Each is said twice: the second time
// nothing should be asked.
import { ConceptStore } from "../dist/store/store.js";
import { Runtime } from "../dist/runtime/evaluator.js";
import { seed } from "../dist/seed/seed.js";
import { turn } from "../dist/runtime/turn.js";
import { c } from "../dist/concept/expression.js";
import { geminiTeacher } from "../dist/research/teacher.js";
const store = new ConceptStore();
seed(store);
const gemini = geminiTeacher();
let asked = 0;
const teacher = async (p) => { asked++; const t0 = Date.now(); const r = await gemini(p); console.log(`  [taught in ${Date.now() - t0} ms] ${r.replace(/\s+/g, " ").slice(0, 300)}`); return r; };
const history = [];
for (const m of ["my sourdough starter died", "what is a gunwale?", "what is a flibbertigibbet?", "i finally got my zaxxle working", "what is a zaxxle?", "my sourdough starter died", "what is a flibbertigibbet?"]) {
  const before = asked;
  const t0 = Date.now();
  const t = await turn(new Runtime(store, {}), m, c("Execution"), { history, teacher }).catch((e) => ({ spoken: "ERROR " + e.message, learned: [] }));
  console.log(`# ${m}  =>  ${t.spoken}  (${Date.now() - t0} ms, teacher asked ${asked - before}) ${t.learned.map((l) => `${l.how}:${l.detail}`).join("; ").slice(0, 300)}`);
  history.push({ message: m, result: t.rendered ?? "", spoken: t.spoken });
}
