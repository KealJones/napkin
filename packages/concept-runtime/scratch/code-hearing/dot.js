async (args, bindings, api) => {
  // "a.name": the member of a by that name; "a.b(c)": that member called.
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const self = bindings.get("word");
  const [owner, member] = self.args.filter((a) => a.name === undefined).map((a) => a.value);
  const of = await api.evaluate(owner, api.context);
  if (!isCall(member)) return api.call("Member", of, member);
  const said = member.args.find((a) => a.name === "said");
  const name = said ? said.value : member.head[0].toLowerCase() + member.head.slice(1);
  const got = api.call("Member", of, name);
  const values = [];
  for (const a of member.args) {
    if (a.name === undefined) values.push(await api.evaluate(a.value, api.context));
  }
  return values.length ? api.call("Call", got, ...values) : got;
}
