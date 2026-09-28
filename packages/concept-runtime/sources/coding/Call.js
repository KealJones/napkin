// @realization Call($f, Rest($with)), context = Explaining(), evaluateArguments = false
// A call said: "calls print with x"; a member called is said as written, "console.log", and a
// built-in method with what its documentation says it does (MethodDoc): "calls names.push with bo,
// which adds the specified elements to the end of an array ...".
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  // A name (Name("xs") while explaining) is written back as the name it is.
  const unnamed = (e) => (isCall(e) && e.head === "Name" && typeof e.args[0]?.value === "string" ? { variable: e.args[0].value } : isCall(e) ? { head: e.head, args: e.args.map((a) => ({ ...a, value: unnamed(a.value) })) } : e);
  const code = (e) => api.writeCode(unnamed(e), "JavaScript").text.trim();
  const said = async (e) => {
    if (isCall(e) && e.head === "Member" && e.args.length === 2) {
      const obj = e.args[0].value;
      const o = isCall(obj) && obj.head === "Call" ? code(obj) : typeof obj === "string" ? JSON.stringify(obj) : await said(obj);
      return typeof o === "string" ? o + "." + String(e.args[1].value) : o;
    }
    return api.evaluate(e, api.context);
  };
  const f = await said(args[0].value);
  const xs = [];
  for (const a of args.slice(1)) {
    // Text written in the code is said as text ("bo"); a name is said as the name.
    if (typeof a.value === "string") {
      xs.push(JSON.stringify(a.value));
      continue;
    }
    const v = await api.evaluate(a.value, api.context);
    xs.push(typeof v === "string" || typeof v === "number" ? v : code(a.value));
  }
  if (typeof f !== "string") return api.call("Call", f, ...xs);
  const list = xs.map(String);
  const joined = list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  const target = args[0].value;
  const method = isCall(target) && target.head === "Member" && typeof target.args[1]?.value === "string" ? target.args[1].value : undefined;
  const doc = method ? await api.evaluate(api.call("MethodDoc", method), api.call("Execution")) : undefined;
  const does = isCall(doc) && doc.args.length >= 3 && typeof doc.args[2].value === "string" ? ", which " + doc.args[2].value : "";
  return (list.length ? "calls " + f + " with " + joined : "calls " + f) + does;
};
