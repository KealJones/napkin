// @realization SourceCode(Rest($parts)), context = Speaking(), evaluateArguments = false
// Code shown as code, fenced with its language.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const text = String(args.find((a) => a.name === undefined)?.value ?? "");
  const language = args.find((a) => a.name === "language")?.value;
  const tag = isCall(language) ? language.head.toLowerCase() : "";
  return "```" + tag + "\n" + text.trimEnd() + "\n```";
};
