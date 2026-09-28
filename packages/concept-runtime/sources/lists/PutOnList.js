// @realization Put($said), context = Imperative(), evaluateArguments = false
// "put eggs on my list": put on the list it names.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const done = await api.evaluate(api.call("ListChange", api.call("Add"), said), api.context);
  return done && done.head === "ListChange" ? api.call("Put", said) : done;
};
