import { c, format } from "./dist/concept/expression.js"; import { seed } from "./dist/seed/seed.js"; import { ConceptStore } from "./dist/store/store.js"; import { Runtime } from "./dist/runtime/evaluator.js"; import { turn } from "./dist/runtime/turn.js";
const s = new ConceptStore(); seed(s);
for (const m of ["Yeah np. Can you tell me the capital of France?", "ok. what is 2 plus 2"]) { const r = await turn(new Runtime(s), m, c("Execution"), { learn: true }); console.log(format(r.expression), "\n =>", format(r.result), "\n", r.spoken); }
