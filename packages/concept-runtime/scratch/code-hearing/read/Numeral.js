// A number written other than as its plain value keeps what its writing states, so a language
// that must choose a type can: "2.0" and "1e3" are Float; a suffix is what the graph says it is
// in this language ("3n" is BigInt in TypeScript, NumberSuffix("n")); digit groups ("1_000")
// and bases are only layout.
const said = String(parts[0]);
const plain = said.replace(/_/g, "");
const suffix = /^(.*?[0-9a-f.])([a-z]+)$/i.exec(plain);
if (suffix && !/^0[xob]/i.test(plain)) {
  const code = (api.context.args ?? []).map((a) => a.value).find((f) => isCall(f) && f.head === "Code");
  const here = (r) => r.context === undefined || (code !== undefined && api.format(r.context) === api.format(code));
  const kind = api.store.mentioning(suffix[2]).find((m) => here(m.relation) && isCall(m.relation.claim) && m.relation.claim.head === "NumberSuffix" && m.relation.claim.args[0].value === suffix[2]);
  if (kind) return api.call(kind.identity, suffix[1]);
}
const value = Number(plain);
if (Number.isNaN(value)) return api.call("Number", said);
return /^[0-9]*\.|e/i.test(plain) && !/^0x/i.test(plain) ? api.call("Float", value) : value;
