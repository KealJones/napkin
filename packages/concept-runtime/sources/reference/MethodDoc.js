// @realization MethodDoc($method), context = Execution()
// What JavaScript's documentation (MDN) says a built-in method does. The kinds of value that have
// the method are asked of the language itself (the VM); the first whose page says is read, its
// summary kept as Documents(kind, method, summary) on JavaScript, stamped from the page. What was
// kept is answered from then on. MethodDoc(method, kind, summary, from = MDN(page)), or the call
// itself when no page says.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const method = String(bindings.get("method"));
  if (!/^[A-Za-z_$][\w$]*$/.test(method)) return api.call("MethodDoc", method);
  const answer = (kind, summary, page) => ({ head: "MethodDoc", args: [{ value: method }, { value: kind }, { value: summary }, ...(page ? [{ name: "from", value: api.call("MDN", page) }] : [])] });
  // Kept already.
  for (const r of api.store.get("JavaScript")?.relations ?? []) {
    const c = r.claim;
    if (!isCall(c) || c.head !== "Documents" || c.args[1]?.value !== method) continue;
    const page = r.stamps?.[0]?.source !== undefined ? api.store.findStamp(r.stamps[0].source)?.relation.claim : undefined;
    return answer(c.args[0].value, c.args[2].value, isCall(page) ? page.args[0]?.value : undefined);
  }
  const probe = api.runCode(
    "[['Array', []], ['String', ''], ['Number', 0], ['Map', new Map()], ['Set', new Set()], ['Object', {}], ['Promise', Promise.resolve()]]" +
      ".filter(([k, v]) => Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(v), " + JSON.stringify(method) + ")).map(([k]) => k)",
  );
  const kinds = Array.isArray(probe.value) ? probe.value : [];
  for (const kind of kinds) {
    const url = "https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/" + kind.toLowerCase() + "/" + method.toLowerCase() + "/index.md";
    const text = await api.evaluate(api.call("FetchText", url));
    if (typeof text !== "string" || !text.startsWith("---")) continue;
    const end = text.indexOf("\n---", 3);
    const front = text.slice(3, end);
    const slug = /\nslug:\s*(\S+)/.exec("\n" + front)?.[1];
    const first = text
      .slice(end + 4)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith("{{") && !p.startsWith("#") && !p.startsWith(">"));
    if (!first) continue;
    const plain = first
      .replace(/\{\{\s*\w+\(\s*"[^"]*"\s*,\s*"([^"]*)"[^}]*\)\s*\}\}/g, "$1")
      .replace(/\{\{\s*\w+\(\s*"([^"]*)"[^}]*\)\s*\}\}/g, "$1")
      .replace(/\{\{[^}]*\}\}/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // "The push() method of Array instances adds ..." is what it does: "adds ...".
    // Its first sentence only.
    const summary = plain.replace(/^The \S+ (static )?method( of \S+( instances| values| objects)?)? /, "").split(/(?<=\.)\s+(?=[A-Z])/)[0].replace(/\.$/, "");
    const page = slug ? "https://developer.mozilla.org/en-US/docs/" + slug : url;
    const record = api.store.addRelation("MDN", api.call("Imported", page), undefined, api.trace.cause);
    api.store.addRelation("JavaScript", api.call("Documents", kind, method, summary), undefined, record.seq);
    return answer(kind, summary, page);
  }
  return api.call("MethodDoc", method);
};
