// @realization Add($a, $b, $c, Rest($more)), context = Execution(), evaluateArguments = false
// "add cheese and pie and nuts to the list", heard as the things Add takes, each its own: put in
// the thing named; naming none, Add's next realization adds them.
async (args, bindings, api) => {
  const all = args.filter((a) => a.name === undefined).map((a) => a.value);
  const done = await api.evaluate(api.call("Change", api.call("Add"), api.call("And", ...all)), api.context);
  return done && done.head === "Change" ? api.call("Add", ...all) : done;
};
