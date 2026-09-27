async (args, bindings, api) => {
  // A number written other than as its plain value keeps what its writing states, so a
  // language that must choose a type can: "2.0" and "1e3" are Float, a suffix is kept as said
  // for the language to read (__SUFFIX__), digit groups ("1_000") and bases are only layout.
  const said = String(args[0].value);
  const plain = said.replace(/_/g, "");
  const suffix = /^(.*?[0-9a-f.])([a-z]+)$/i.exec(plain);
  const SUFFIX = __SUFFIX__;
  if (suffix && !/^0[xob]/i.test(plain) && SUFFIX[suffix[2]]) return api.call(SUFFIX[suffix[2]], suffix[1]);
  const value = Number(plain);
  if (Number.isNaN(value)) return api.call("Number", said);
  return /^[0-9]*\.|e/i.test(plain) && !/^0x/i.test(plain) ? api.call("Float", value) : value;
}
