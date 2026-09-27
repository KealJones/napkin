// @realization Run(Rest($said)), context = Execution(), evaluateArguments = false
// Code run, apart from the host (api.runCode: no require, no files, a second at most): its
// first function called with the values said beside it ("run `f` with 21"), or the code itself
// when it defines none. Ran(value, code), or Ran(code, error = "...") when it failed.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const code = await api.evaluate(api.call("CodeOf", ...args.map((a) => a.value)), api.context);
  if (!isCall(code) || code.head !== "SourceCode") return code;
  const ir = code.args.find((a) => a.name === "ir")?.value;
  if (ir === undefined) return ({ head: "Ran", args: [{ name: "error", value: "no language I know reads it as code" }] });
  // The values said beside the code: numbers and quoted text, in the order said.
  const values = [];
  const collect = (e) => {
    if (typeof e === "number" || typeof e === "string") values.push(e);
    else if (isCall(e) && !["InlineCode", "Block", "File", "SourceCode", "Ref"].includes(e.head)) for (const a of e.args) if (a.name === undefined) collect(a.value);
  };
  for (const a of args) collect(a.value);
  const body = isCall(ir) && ir.head === "Module" ? ir.args[0].value : ir;
  const statements = isCall(body) && body.head === "Sequence" ? body.args.map((a) => a.value) : [body];
  const fn = statements.find((s) => isCall(s) && s.head === "Func");
  const written = api.writeCode(ir, "JavaScript");
  if (written.unwritable.length) return ({ head: "Ran", args: [{ name: "error", value: "I can't run " + written.unwritable.join(", ") + " yet" }] });
  const name = fn && fn.args[0].value !== null && typeof fn.args[0].value === "object" && "variable" in fn.args[0].value ? fn.args[0].value.variable : undefined;
  const source = name ? written.text + "\n;(" + name + ")(" + values.map((v) => JSON.stringify(v)).join(", ") + ")" : written.text;
  const ran = api.runCode(source);
  // The code run goes with what it gave, so "it" said next can still mean the code.
  return ran.error !== undefined ? ({ head: "Ran", args: [{ value: code }, { name: "error", value: ran.error }] }) : api.call("Ran", api.fromHost(ran.value), code);
};
