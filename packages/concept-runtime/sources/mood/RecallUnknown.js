// @realization Recall($line, Unknown($inner)), context = Interrogative(), evaluateArguments = false
// A question left unanswered for want of a word ("pi" in "what is pi times 2"), where what
// stood in its place was itself unrecognized: look inside it for the word to recall (Recollect.js).
async (args, bindings, api) => {
  const line = bindings.get("line");
  const inner = bindings.get("inner");
  return api.evaluate(api.call("Recollect", line, api.call("Unknown", inner), inner), api.context);
};
