// @realization Line($line), context = Execution(), evaluateArguments = false
// A line in any other mood (a command): read, and done.
async (args, bindings, api) => {
  const line = await api.evaluate(api.call("Read", bindings.get("line")));
  return api.evaluate(line, api.context);
};
