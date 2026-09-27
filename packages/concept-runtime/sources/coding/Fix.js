// @realization Fix(Rest($said)), context = Execution(), evaluateArguments = false
// Code with what Check finds that has one plain repair repaired: a comparison written as an
// assignment, steps after a return, a thing set to itself. Written back in its language when
// Napkin can write it (else in JavaScript, said so), the repair made in the text so the rest keeps
// its layout: Fixed(SourceCode(...), changes=List(...)).
// What has no plain repair is left as Check found it.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const code = await api.evaluate(api.call("CodeOf", ...args.map((a) => a.value)), api.context);
  if (!isCall(code) || code.head !== "SourceCode") return code;
  const ir = code.args.find((a) => a.name === "ir")?.value;
  if (ir === undefined) return api.evaluate(api.call("Check", code), api.context);
  const show = (e) => api.writeCode(e, "JavaScript").text.trim().replace(/^\((.*)\)$/, "$1");
  const changes = [];
  const fix = (e) => {
    if (!isCall(e)) return e;
    let x = { head: e.head, args: e.args.map((a) => ({ ...a, value: fix(a.value) })) };
    const a = x.args.map((y) => y.value);
    if ((x.head === "If" || x.head === "While") && isCall(a[0]) && a[0].head === "Assign") {
      const eq = api.call("Equals", a[0].args[0].value, a[0].args[1].value);
      changes.push("`" + show(a[0]) + "` compares now: `" + show(eq) + "`");
      x = { head: x.head, args: [{ value: eq }, ...x.args.slice(1)] };
    }
    if (x.head === "Sequence") {
      const kept = [];
      let ended = false;
      for (const s of x.args) {
        if (ended && !(isCall(s.value) && s.value.head === "Undefined")) {
          changes.push("removed `" + show(s.value) + "`, which came after a return and never ran");
          continue;
        }
        if (isCall(s.value) && s.value.head === "Assign" && s.value.args.length === 2 && api.format(s.value.args[0].value) === api.format(s.value.args[1].value)) {
          changes.push("removed `" + show(s.value) + "`, which set a thing to itself");
          continue;
        }
        if (isCall(s.value) && ["Return", "Throw"].includes(s.value.head)) ended = true;
        kept.push(s);
      }
      x = { head: "Sequence", args: kept };
    }
    return x;
  };
  const fixed = fix(ir);
  if (!changes.length) return api.evaluate(api.call("Check", code), api.context);
  const language = code.args.find((a) => a.name === "language")?.value;
  const wanted = isCall(language) ? language.head : "JavaScript";
  let written = api.writeCode(fixed, wanted);
  let as = wanted;
  if (written.unwritable.length) {
    written = api.writeCode(fixed, "JavaScript");
    as = "JavaScript";
  }
  // In the language it was written in, the repair is made in the text itself, so the rest keeps its layout.
  const original = code.args[0].value;
  const text = as === wanted && typeof original === "string" ? api.patchText(original, api.writeCode(ir, as).text, written.text) ?? written.text : written.text;
  const file = code.args.find((a) => a.name === "file");
  const out = [{ value: text }, { name: "language", value: api.call(as) }, { name: "ir", value: fixed }, ...(file ? [file] : [])];
  return { head: "Fixed", args: [{ value: { head: "SourceCode", args: out } }, { name: "changes", value: api.call("List", ...changes) }, ...(as !== wanted ? [{ name: "writtenAs", value: api.call(as) }] : [])] };
};
