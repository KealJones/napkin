import { c, format, parse } from "./dist/concept/expression.js"; import { seed } from "./dist/seed/seed.js"; import { ConceptStore } from "./dist/store/store.js"; import { Runtime } from "./dist/runtime/evaluator.js";
const s = new ConceptStore(); seed(s); const rt = new Runtime(s);
console.log(format(await rt.evaluate(parse('WikidataSenses("mile")'), c("Execution"))).slice(0, 600));
console.log(format(await rt.evaluate(parse('Fetch("https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=Q253276&property=P2370&format=json")'), c("Execution"))).slice(0, 300));
