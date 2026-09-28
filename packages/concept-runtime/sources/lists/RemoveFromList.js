// @realization Remove($said), context = Imperative(), evaluateArguments = false
// "remove milk from my list": taken off the list it names.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const done = await api.evaluate(api.call("ListChange", api.call("Remove"), said), api.context);
  return done && done.head === "ListChange" ? api.call("Remove", said) : done;
};
