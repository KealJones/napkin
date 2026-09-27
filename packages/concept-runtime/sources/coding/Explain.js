// @realization Explain(Rest($said)), context = Execution(), evaluateArguments = false
// Code said in words: each statement of its code IR as the construct is said under
// Explaining(); a statement with no wording yet is shown as the code it is. Anything that is not
// code is explained the way What explains it (Explain is its synonym).
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const code = await api.evaluate(api.call("CodeOf", ...args.map((a) => a.value)), api.context);
  if (!isCall(code) || code.head === "NoCode") return api.evaluate(api.call("What", ...args.map((a) => a.value)), api.context);
  if (code.head !== "SourceCode") return code;
  const ir = code.args.find((a) => a.name === "ir")?.value;
  if (ir === undefined) return api.call("Explained", code, "text that no language I know reads as code");
  // A name in the code is said as it is written.
  const named = (e) => {
    if (e !== null && typeof e === "object" && "variable" in e) return api.call("Name", e.variable);
    if (!isCall(e)) return e;
    return { head: e.head, args: e.args.map((a) => ({ ...a, value: named(a.value) })) };
  };
  let body = isCall(ir) && ir.head === "Module" ? ir.args[0].value : ir;
  const statements = isCall(body) && body.head === "Sequence" ? body.args.map((a) => a.value) : [body];
  const isVar = (e) => e !== null && typeof e === "object" && "variable" in e;
  const nameOf = (e) => (isVar(e) ? e.variable : typeof e === "string" ? e : isCall(e) ? api.writeCode(e, "JavaScript").text.trim() : String(e));
  const list = (xs) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
  // Longer code (a file) is said as what it is made of rather than step by step: what its first
  // comment says it is, what it takes in, what it defines, what it gives out.
  const steps = statements.filter((s) => !(isCall(s) && s.head === "Comment"));
  if (steps.length > 4) {
    const about = statements.find((s) => isCall(s) && s.head === "Comment");
    const imports = [];
    const functions = [];
    const values = [];
    const classes = [];
    const exported = [];
    const look = (s, isExport) => {
      if (!isCall(s)) return;
      const a = s.args.map((x) => x.value);
      if (s.head === "Import" && a.length >= 2) imports.push(String(a[1]));
      else if ((s.head === "Export" || s.head === "ExportDefault") && a.length) look(a[0], true);
      else if (s.head === "Async" && a.length) look(a[0], isExport);
      else if (s.head === "Func" && a.length >= 2) {
        const ps = isCall(a[1]) ? a[1].args.map((p) => nameOf(isCall(p.value) && p.value.head === "Default" ? p.value.args[0].value : p.value)) : [];
        functions.push(nameOf(a[0]) + "(" + ps.join(", ") + ")");
        if (isExport) exported.push(nameOf(a[0]));
      } else if (s.head === "Class" && a.length) {
        classes.push(nameOf(a[0]));
        if (isExport) exported.push(nameOf(a[0]));
      } else if ((s.head === "Bind" || s.head === "Var") && a.length) {
        values.push(nameOf(a[0]));
        if (isExport) exported.push(nameOf(a[0]));
      }
    };
    for (const s of statements) look(s, false);
    const parts = [];
    if (about) parts.push("it says it is " + String(about.args[0].value).replace(/(^|\n)\s*\*+/g, " ").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, ""));
    if (imports.length) parts.push("it takes in " + list(imports));
    const defs = [];
    if (functions.length) defs.push((functions.length === 1 ? "a function " : "functions ") + list(functions));
    if (classes.length) defs.push((classes.length === 1 ? "a class " : "classes ") + list(classes));
    if (values.length) defs.push((values.length === 1 ? "a value " : "values ") + list(values));
    if (defs.length) parts.push("it defines " + list(defs));
    if (exported.length) parts.push("it gives out " + list(exported));
    return api.call("Explained", code, parts.join("; "));
  }
  const said = [];
  for (const s of statements) {
    if (isCall(s) && s.head === "Comment") continue;
    const words = await api.evaluate(named(s), api.call("Explaining"));
    said.push(typeof words === "string" ? words : "does `" + api.writeCode(s, "JavaScript").text.trim() + "`");
  }
  return api.call("Explained", code, said.length ? said.join("; then ") : "nothing");
};
