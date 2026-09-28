// @realization WordAlone($line), context = Declarative(), evaluateArguments = false
// A word said alone that does nothing and is not talk ("clock", not "lol"): what it is, asked.
// The call itself otherwise.
async (args, bindings, api) => {
  const line = bindings.get("line");
  if (!line || !line.head || line.args.length) return api.call("WordAlone", line);
  const unit = api.store.get(line.head);
  const acts = !!unit && unit.realizations.some((r) => !r.retired);
  const kinds = await api.evaluate(api.call("Closure", line.head, "IsA"));
  const talk = kinds && kinds.head === "List" && kinds.args.some((a) => a.value && a.value.head === "Interjection");
  if (acts || talk) return api.call("WordAlone", line);
  const facets = api.context && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  return api.evaluate(api.call("ContextScope", api.call("Interrogative"), api.call("What", api.call("Is", line))), api.call("Context", ...facets.filter((f) => !(f && f.head === "Declarative"))));
};
