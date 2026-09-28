// @realization NamedWhole($line), context = Declarative(), evaluateArguments = false
// Words that read as one Concept, a greeting said whole ("good morning" is GoodMorning): that
// Concept. The call itself otherwise.
async (args, bindings, api) => {
  const line = bindings.get("line");
  const named = await api.evaluate(api.call("Read", line));
  if (named && named.head && !named.args.length && api.format(named) !== api.format(line)) {
    const value = await api.evaluate(named, api.context);
    // A name said alone that is only a name ("steven spielberg"): who or what it is, asked.
    if (api.format(value) !== api.format(named)) return value;
    const asked = await api.evaluate(api.call("WordAlone", named), api.context);
    return asked && asked.head === "WordAlone" ? value : asked;
  }
  return api.call("NamedWhole", line);
};
