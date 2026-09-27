// @realization Block(Rest($parts)), context = Execution(), evaluateArguments = false
// A block of code shown in a message, read as the code IR when a language reads it: SourceCode.
// A block no language reads is its text, as before.
async (args, bindings, api) => {
  const positional = args.filter((a) => a.name === undefined).map((a) => a.value);
  const named = (k) => args.find((a) => a.name === k)?.value;
  const text = positional[positional.length - 1];
  const ir = named("ir");
  if (ir === undefined) return text;
  return { head: "SourceCode", args: [{ value: text }, { name: "language", value: named("language") }, { name: "ir", value: ir }] };
};
