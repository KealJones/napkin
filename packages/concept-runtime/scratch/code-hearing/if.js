async (args, bindings, api) => {
  // "if" holds a condition, then what to do, then (after "else") what to do otherwise.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const [condition, ...rest] = args.map((a) => a.value);
  const otherwise = rest.length && isCall(rest[rest.length - 1]) && rest[rest.length - 1].head === "Else" ? rest.pop().args.map((a) => a.value) : [];
  const block = (xs) => (xs.length === 0 ? api.call("Undefined") : xs.length === 1 ? xs[0] : api.call("Sequence", ...xs));
  return api.call("If", condition, block(rest), block(otherwise));
}
