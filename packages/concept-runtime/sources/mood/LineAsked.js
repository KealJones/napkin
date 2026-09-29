// @realization Line($line), context = Interrogative(), evaluateArguments = false
// A question: read and worked out. Left unworked, or not known: whether it was told (Believe),
// then looked for further (Pursue), then asked again with what its unknown words were said to be
// (Recall).
async (args, bindings, api) => {
  // Only what narrows the last question: that question, with it (Continues).
  const continued = await api.evaluate(api.call("Continues", bindings.get("line")), api.context);
  if (continued && continued.head !== "Continues") return continued;
  const line = await api.evaluate(api.call("Read", bindings.get("line")));
  const value = await api.evaluate(line, api.context);
  const same = (a, b) => api.format(a) === api.format(b);
  const unknownTruth = value && value.head === "Answer" && value.args[0] && value.args[0].value && value.args[0].value.head === "UnknownTruth";
  if (same(value, line) || unknownTruth) {
    const told = await api.evaluate(api.call("Believe", line, api.call("Asked")), api.call("Execution"));
    if (told && told.head === "Answer") return told;
  }
  if (same(value, line)) {
    const found = await api.evaluate(api.call("Pursue", line), api.context);
    if (found && found.head === "Found") return api.call("Answer", found.args[0].value);
  }
  // An answer that is a result (CannotDo, Added, Made) is whole: no word in it is wanting.
  const inner = value && value.head === "Answer" && value.args[0] ? value.args[0].value : undefined;
  if (inner && inner.head && api.typesOf(inner).includes("Result")) return value;
  const recalled = await api.evaluate(api.call("Recall", line, value), api.context);
  return recalled && recalled.head === "Recall" ? value : recalled;
};
