// @realization Line($line), context = Declarative(), evaluateArguments = false
// A statement: the Concept its words name whole ("good morning"), a word said alone asked about
// ("clock"), something that works out to a value or an answer ("average of 3, 5 and 10", "that
// was wrong"), what is believed of someone or something, or else noted, with a reply.
async (args, bindings, api) => {
  const line = bindings.get("line");
  for (const step of ["NamedWhole", "WordAlone", "WorksOut"]) {
    const asked = api.call(step, line);
    const got = await api.evaluate(asked, api.context);
    if (api.format(got) !== api.format(asked)) return got;
  }
  const belief = await api.evaluate(api.call("Believe", line), api.call("Execution"));
  if (belief && (belief.head === "Believed" || (belief.head === "Sequence" && belief.args.every((a) => a.value && a.value.head === "Believed")))) return belief;
  return api.evaluate(api.call("Note", line), api.context);
};
