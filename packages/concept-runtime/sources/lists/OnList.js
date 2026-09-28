// @realization What(Is(On(), $said)), context = Execution(), evaluateArguments = false
// "what is on my list?": what the list it names holds.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const read = await api.evaluate(api.call("ListRead", said), api.call("Execution"));
  return read && read.head === "ListRead" ? api.call("What", args[0].value) : read;
};
