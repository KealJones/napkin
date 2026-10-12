// @realization Unfilled(Rest($x)), context = Speaking(), evaluateArguments = false
// "9 minus what?": the words as they were said, as far as they went, and a question where the hole is.
async (args, bindings, api) => {
  const said = args.find((a) => a.name === "said");
  let words = said && typeof said.value === "string" ? said.value : "";
  if (!words) {
    const r = await api.evaluate(api.call("Say", args[0].value), api.call("Execution"));
    words = typeof r === "string" ? r : "";
  }
  words = words.trim().replace(/[.!?]+$/, "");
  if (!words) {
    return "Something is missing there. What should it be?";
  }
  return words[0].toUpperCase() + words.slice(1) + " what?";
};
