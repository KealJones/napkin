// @realization Recall($line, Answer($inner)), context = Interrogative(), evaluateArguments = false
// A question left unanswered for want of a word ("pi" in "what is pi times 2"), where what
// stood in its place was itself an answer: look inside it for the word to recall (Recollect.js).
async (args, bindings, api) => {
  const line = bindings.get("line");
  const inner = bindings.get("inner");
  return api.evaluate(api.call("Recollect", line, api.call("Answer", inner), inner), api.context);
};
