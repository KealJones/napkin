// @realization CodeOf(Rest($said)), context = Execution(), evaluateArguments = false
// The code what was said is about, wherever the words put it: code shown (InlineCode, Block),
// a file named (File), code an earlier answer held (a Ref resolved to it), or SourceCode
// already. NoCode() when there is none.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const CODE = ["SourceCode", "InlineCode", "Block", "File", "Fixed", "Converted", "Explained", "Findings"];
  // Code shown in the message comes first; what "it" or "this" pointed back to, after.
  const find = (e, back) => {
    if (!isCall(e)) return undefined;
    if (CODE.includes(e.head)) return e;
    const to = e.args.find((a) => a.name === "resolvedTo");
    if (to && back) {
      const hit = find(to.value, back);
      if (hit) return hit;
    }
    for (const a of e.args) {
      if (a.name !== undefined) continue;
      const hit = find(a.value, back);
      if (hit) return hit;
    }
    return undefined;
  };
  let found = undefined;
  for (const back of [false, true]) {
    for (const a of args) {
      found = find(a.value, back);
      if (found) break;
    }
    if (found) break;
  }
  if (!found) return api.call("NoCode");
  if (found.head === "SourceCode") return found;
  // What an earlier answer held about code is that code.
  if (["Fixed", "Converted", "Explained", "Findings"].includes(found.head)) {
    const inner = found.args.find((a) => a.name === undefined && isCall(a.value) && a.value.head === "SourceCode");
    return inner ? inner.value : api.call("NoCode");
  }
  return api.evaluate(found, api.context);
};
