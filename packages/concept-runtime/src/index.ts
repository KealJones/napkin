export * from "./concept/expression.js";
export * from "./concept/match.js";
export * from "./concept/unit.js";
export * from "./store/store.js";
export * from "./store/relations.js";
export * from "./store/cells.js";
export * from "./store/persist.js";
export * from "./store/forget.js";
export * from "./store/traces.js";
export * from "./runtime/context.js";
export * from "./runtime/select.js";
export * from "./runtime/trace.js";
export * from "./runtime/evidence.js";
export * from "./runtime/turn-signal.js";
export * from "./runtime/errors.js";
export * from "./runtime/evaluator.js";
export * from "./seed/seed.js";
export * from "./ears/ears.js";
export * from "./ears/lift.js";
export * from "./ears/prompt.js";
export * from "./ears/ollama.js";
export * from "./ears/say.js";
export * from "./ears/mood.js";
export {
  runEars, rescore as rescoreEars, summarize as summarizeEars, compare as compareEars, latestRun as latestEarsRun,
  save as saveEarsRun, currentCases as earsCases, type Run as EarsRun, type CaseResult as EarsCaseResult,
  listRuns as listEarsRuns, openRun as openEarsRun, logConversion as logEarsConversion,
  recentConversions as recentEarsConversions, hashPrompt as hashEarsPrompt, unfuse as unfuseGold,
} from "./ears/eval/harness.js";
export { score, type EvalCase, type Score } from "./ears/eval/score.js";
export * from "./learn/learn.js";
export * from "./research/sources.js";
export * from "./learn/teacher.js";
export * from "./learn/study.js";
export * from "./learn/curriculum.js";
export * from "./code/import.js";
export * from "./learn/reading.js";
export * from "./runtime/turn.js";
export * from "./runtime/references.js";
export * from "./runtime/individuals.js";
export * from "./runtime/exist.js";
export * from "./memory/conversations.js";

import { ConceptStore } from "./store/store.js";
import { Runtime } from "./runtime/evaluator.js";
import { seed } from "./seed/seed.js";

/** A runtime with the seed network already in place. */
export function createRuntime(): Runtime {
  const store = new ConceptStore();
  seed(store);
  return new Runtime(store);
}
