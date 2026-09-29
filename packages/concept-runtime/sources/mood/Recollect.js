// @realization Recollect($line, $value, $inner), context = Interrogative(), evaluateArguments = false
// The search shared by Recall, RecallAnswer and RecallUnknown: is a word left over in $inner
// with no meaning of its own, that a plain "what is it" answers as a number or a fact; if so,
// put that answer where the word stood in $line and work the question out again. $value is the
// call as it stood ($line's own $value, or the Answer/Unknown that wrapped $inner), kept to hand
// back unchanged when nothing is recalled.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const line = bindings.get("line");
  const value = bindings.get("value");
  const inner = bindings.get("inner");
  const none = api.call("Recall", line, value);
  const facets = api.context && api.context.head === "Context" ? api.context.args.map((a) => a.value) : [api.context];
  if (facets.some((f) => f && f.head === "Recalling")) return none;
  const kind = api.call("Interrogative");
  const look = (e, into) => {
    if (!isCall(e)) return;
    if (!e.args.length) into.add(e.head);
    // A named argument is data about its call (what "he" resolved to), not something said.
    for (const a of e.args) if (a.name === undefined) look(a.value, into);
  };
  const said = new Set();
  look(line, said);
  const left = new Set();
  if (isCall(inner) && inner.args.length) for (const a of inner.args) look(a.value, left);
  // Only a word with no behaviour of its own: "do" and "is" are not things to recall.
  const acts = (h) => (api.store.get(h)?.realizations ?? []).some((r) => !r.retired);
  const wanting = [...left].filter((h) => said.has(h) && !acts(h));
  if (!wanting.length) return none;
  let changed = line;
  let recalled = false;
  for (const h of wanting) {
    const asked = await api.evaluate(api.call("ContextScope", kind, api.call("What", api.call("Is", api.call(h)))), api.call("Context", ...facets, api.call("Recalling")));
    // A thing that is a number (pi) is that number where it is worked on, not where it is asked about.
    const operand = (e) => isCall(e) && e.args.some((a) => (isCall(a.value) && a.value.head === h && !a.value.args.length && !["What", "Is"].includes(e.head)) || operand(a.value));
    const number = operand(line) ? await api.evaluate(api.call("NumericValue", api.call(h)), api.call("Execution")) : undefined;
    const got = typeof number === "number" ? number : isCall(asked) && asked.head === "Answer" && asked.args.length ? asked.args[0].value : undefined;
    if (got === undefined || (isCall(got) && (got.head === "Unknown" || api.format(got).includes(h + "()")))) continue;
    const put = (e) => (isCall(e) ? (e.head === h && !e.args.length ? got : { head: e.head, args: e.args.map((a) => ({ ...a, value: put(a.value) })) }) : e);
    changed = put(changed);
    recalled = true;
  }
  if (!recalled) return none;
  const again = await api.evaluate(changed, api.context);
  return api.format(again) !== api.format(changed) ? again : none;
};
