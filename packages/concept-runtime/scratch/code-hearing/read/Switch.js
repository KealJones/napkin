// "switch (x) { case 1: a; break; default: b }": each case with the statements after its label.
const [subject, ...rest] = parts;
const cases = [];
let current;
const label = (x) => (is(x, "Colon") && (is(positional(x)[0], "Case") || is(positional(x)[0], "Default")) ? positional(x)[0] : undefined);
for (const x of rest) {
  const l = label(x);
  const said = l ? positional(x).slice(1) : [x];
  if (l) cases.push((current = { l, body: [] }));
  for (const y of said) {
    if (!current) continue;
    if (is(y, "Braces")) current.body.push(...positional(y));
    else current.body.push(y);
  }
}
const out = [];
for (const c of cases) {
  const body = await ask("CodeStatements", ...c.body);
  out.push(is(c.l, "Case") ? api.call("Case", await read(positional(c.l)[0]), body) : api.call("Default", body));
}
return api.call("Switch", await read(subject), api.call("List", ...out));
