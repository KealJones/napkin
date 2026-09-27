async (args, bindings, api) => {
  // What was heard, read as one program: its statements in order.
  const statements = args.filter((a) => a.name === undefined).map((a) => a.value);
  return api.call("Module", statements.length === 1 ? statements[0] : api.call("Sequence", ...statements));
}
