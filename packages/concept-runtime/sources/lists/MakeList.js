// @realization Write(List(Rest($kind))), context = Execution(), evaluateArguments = false
// "make a shopping list": the list of that kind, started when there is none yet.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const said = args[0].value;
  if (!said.args.every((a) => a.name === undefined && isCall(a.value) && !a.value.args.length)) return api.call("Write", said);
  const list = await api.evaluate(api.call("ListMeant", said, true), api.call("Execution"));
  return api.call("ListMade", list);
};
