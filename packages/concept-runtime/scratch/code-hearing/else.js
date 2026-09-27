async (args, bindings, api) => {
  // "else" goes on from the block before it: it belongs to the word that block belongs to.
  const self = bindings.get("word");
  const [prompt, at, links] = self.args.map((a) => a.value);
  const v = api.toHost(await api.evaluate(api.call("CodeView", prompt, links), api.context));
  let p = at - 1;
  while (p >= 0 && v.kinds[p].includes("Separator")) p--;
  const opened = p >= 0 && v.kinds[p].includes("Closer") ? v.pair[p] : -1;
  if (opened < 0 || !v.block[opened] || v.leader[opened] < 0) return api.call("List");
  return api.call("List", api.call("Link", at, v.leader[opened], api.call("Takes")));
}
