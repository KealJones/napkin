// @realization Line($line), context = Execution(), evaluateArguments = false
// A line in any other mood (a command): read, and done. A word alone that does nothing as a
// command ("milk", after making a shopping list) may be a thing for a holder just made.
async (args, bindings, api) => {
  const line = await api.evaluate(api.call("Read", bindings.get("line")));
  const done = await api.evaluate(line, api.context);
  if (api.format(done) !== api.format(line) || !line || !line.head || line.args.length) return done;
  const filled = await api.evaluate(api.call("Fills", line), api.context);
  return filled && filled.head === "Fills" ? done : filled;
};
