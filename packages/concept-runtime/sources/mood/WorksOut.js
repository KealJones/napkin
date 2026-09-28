// @realization WorksOut($line), context = Declarative(), evaluateArguments = false
// A thing named that works out to a value ("average of 3, 5 and 10", "square root of 144") is
// asked for, not told; a statement something takes as said has its answer, when that is not a
// truth ("that was wrong" is apologised for; "my name is Keal" is not answered "yes"). Worked out
// apart first. The call itself when it is neither.
async (args, bindings, api) => {
  const line = bindings.get("line");
  if (!line || !line.head || !line.args.length) return api.call("WorksOut", line);
  const facets = api.context && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  const read = await api.evaluate(api.call("Read", line));
  let value = undefined;
  try {
    value = await api.evaluate(read, api.call("Context", ...facets, api.call("Hypothetical")));
  } catch (error) {
    value = undefined;
  }
  const plain = (v) => typeof v === "number" || (typeof v === "string" && v.length > 0) || (v && v.head === "List" && v.args.length > 0 && v.args.every((a) => plain(a.value)));
  const told = value && value.head === "Answer" && !(value.args[0] && value.args[0].value && ["True", "False", "UnknownTruth", "Unknown"].includes(value.args[0].value.head));
  if (told) return api.evaluate(read, api.context);
  if (plain(value)) {
    const answer = await api.evaluate(read, api.call("Context", ...facets.filter((f) => !(f && f.head === "Declarative")), api.call("Interrogative")));
    return answer && answer.head === "Answer" ? answer : api.call("Answer", answer);
  }
  return api.call("WorksOut", line);
};
