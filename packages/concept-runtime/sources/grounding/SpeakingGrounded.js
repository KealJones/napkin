// @realization Grounded(Rest($x)), context = Speaking(), evaluateArguments = false
// A meaning grounded: the word, what the dictionary said, and what it does now.
async (args, bindings, api) => {
  const doing = args[0].value;
  const gloss = args.find((a) => a.name === "gloss")?.value;
  const body = api.writeCode(args[1].value, "JavaScript");
  return "I looked up " + doing.head.toLowerCase() + ": \"" + String(gloss) + "\". Read on the value, that's `" + body.text + "`, and it does what " + doing.head.toLowerCase() + " does, so I've kept it.";
};
