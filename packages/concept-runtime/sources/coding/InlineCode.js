// @realization InlineCode($text, ir = $ir, language = $language), context = Execution(), evaluateArguments = false
// Code shown in a message, read as the code IR by the language that reads it (ears/verbatim.ts,
// code-reading.ts): SourceCode.
async (args, bindings, api) => ({ head: "SourceCode", args: [{ value: bindings.get("text") }, { name: "language", value: bindings.get("language") }, { name: "ir", value: bindings.get("ir") }] });
