async (args, bindings, api) => {
  // "function f(a, b) { ... }": the call it holds names the function and its parameters; the
  // rest is its body, which gives undefined when it does not end by returning.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const [signature, ...body] = args.map((a) => a.value);
  if (!isCall(signature) || signature.head !== "Call") return api.call("Func", signature, ...body);
  const [name, ...params] = signature.args.map((a) => a.value);
  const steps = body.filter((s) => !(isCall(s) && s.head === "Undefined" && s.args.length === 0));
  const last = steps[steps.length - 1];
  if (!(isCall(last) && last.head === "Return")) steps.push(api.call("Undefined"));
  return api.call("Func", name, api.call("List", ...params), steps.length === 1 ? steps[0] : api.call("Sequence", ...steps));
}
