// @realization Unfilled(Rest($x)), context = Speaking(), evaluateArguments = false
// "9 minus what?": the words as far as they went, and a question where the hole is.
async (args, bindings, api) => {
  const r = await api.evaluate(api.call("Say", args[0].value), api.call("Execution"));
  const said = typeof r === "string" ? r.trim().replace(/[.!?]+$/, "") : "";
  if (!said) {
    return "Something is missing there. What should it be?";
  }
  return said[0].toUpperCase() + said.slice(1) + " what?";
};
