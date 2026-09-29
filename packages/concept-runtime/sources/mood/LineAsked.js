// @realization Line($line), context = Interrogative(), evaluateArguments = false
// A question: read and worked out. Left unworked, or not known: whether it was told (Believe),
// then asked again with what its unknown words were said to be (Recall), then what is still undone
// in it looked for further (Unworked).
async (args, bindings, api) => {
  // Only what narrows the last question: that question, with it (Continues).
  const continued = await api.evaluate(api.call("Continues", bindings.get("line")), api.context);
  if (continued && continued.head !== "Continues") return continued;
  const line = await api.evaluate(api.call("Read", bindings.get("line")));
  const since = api.trace.mark();
  const value = await api.evaluate(line, api.context);
  const same = (a, b) => api.format(a) === api.format(b);
  const unknownTruth = value && value.head === "Answer" && value.args[0] && value.args[0].value && value.args[0].value.head === "UnknownTruth";
  if (same(value, line) || unknownTruth) {
    const told = await api.evaluate(api.call("Believe", line, api.call("Asked")), api.call("Execution"));
    if (told && told.head === "Answer") return told;
  }
  // An answer that is a result (CannotDo, Added, Made) is whole: no word in it is wanting.
  const inner = value && value.head === "Answer" && value.args[0] ? value.args[0].value : undefined;
  if (inner && inner.head && api.typesOf(inner).includes("Result")) return value;
  const recalled = await api.evaluate(api.call("Recall", line, value), api.context);
  const worked = recalled && recalled.head === "Recall" ? value : recalled;
  // Undone: as it was said, not known, or something that stayed as it was said.
  const undone = (v, l) => {
    let core = v;
    for (const wrap of ["Answer", "Unknown"]) if (core && core.head === wrap && core.args.length) core = core.args[0].value;
    const held = api.format(core);
    return held === api.format(l) || (v && v.head === "Unknown") || (core && core.head === "Unknown") || api.trace.residuals(since).some((e) => e.output && api.format(e.output) === held);
  };
  if (!undone(worked, line)) return worked;
  const found = await api.evaluate(api.call("Unworked", line, worked, since), api.context);
  return found && found.head === "Answer" ? found : worked;
};
