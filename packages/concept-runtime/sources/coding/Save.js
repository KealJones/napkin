// @realization Save(Rest($said)), context = Execution(), evaluateArguments = false, properties = List(Effectful())
// Code written to a file: the file it came from, or the file said ("save it to x.ts"), only under
// where Napkin was started. Written(File(path)), or Unwritable(File(path)).
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  // Where it goes ("to x.ts") is not the code to save.
  const toward = (e) => isCall(e) && e.head === "To";
  const code = await api.evaluate(api.call("CodeOf", ...args.map((a) => a.value).filter((v) => !toward(v))), api.context);
  if (!isCall(code) || code.head !== "SourceCode") return code;
  // A file named for it wins over the file it came from.
  let path = undefined;
  const find = (e) => {
    if (path || !isCall(e)) return;
    if (e.head === "File" && typeof e.args[0]?.value === "string" && e !== code) path = e.args[0].value;
    for (const a of e.args) if (a.name === undefined) find(a.value);
  };
  for (const a of args) {
    const v = a.value;
    if (isCall(v) && v.head === "To") find(v);
  }
  path = path ?? code.args.find((a) => a.name === "file")?.value;
  if (typeof path !== "string") return api.call("NoFile", code);
  const written = api.writeFile(path, String(code.args[0].value));
  return written ? api.call("Written", api.call("File", path)) : api.call("Unwritable", api.call("File", path));
};
