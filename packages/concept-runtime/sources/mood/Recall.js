// @realization Recall($line, $value), context = Interrogative(), evaluateArguments = false
// A question left unanswered for want of a word ("pi" in "what is pi times 2"): what the word is,
// asked the way "what is pi" asks it (a number, where the word is worked on), stands in for it,
// and the question is worked out again. The call itself when nothing is recalled. What stood in
// for an unresolved word wrapped in Answer or Unknown is looked inside instead (RecallAnswer.js,
// RecallUnknown.js); this is the fallback for whatever else $value is. The search itself is
// shared with those two, in Recollect.js.
async (args, bindings, api) => {
  const line = bindings.get("line");
  const value = bindings.get("value");
  return api.evaluate(api.call("Recollect", line, value, value), api.context);
};
