// @realization NamedWhole($line), context = Declarative(), evaluateArguments = false
// Words that read as one Concept, a greeting said whole ("good morning" is GoodMorning): that
// Concept. The call itself otherwise.
async (args, bindings, api) => {
  const line = bindings.get("line");
  const named = await api.evaluate(api.call("Read", line));
  if (named && named.head && !named.args.length && api.format(named) !== api.format(line)) return api.evaluate(named, api.context);
  return api.call("NamedWhole", line);
};
