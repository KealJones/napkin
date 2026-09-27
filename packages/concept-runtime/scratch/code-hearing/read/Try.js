// "try" its block, "catch (e)" what to do on failure, "finally" what to do after either.
const done = parts.filter((x) => !is(x, "Catch") && !is(x, "Finally"));
const caught = parts.find((x) => is(x, "Catch"));
const after = parts.find((x) => is(x, "Finally"));
let t = api.call("Try", await ask("CodeStatements", ...done));
if (caught) {
  const cs = positional(caught);
  const said = is(cs[0], "Parens") ? positional(cs[0]) : undefined;
  const param = said && said.length ? await ask("CodeTarget", said[0]) : api.fromHost({ variable: "_" });
  t = api.call("Try", ...positional(t), api.call("Catch", param, await ask("CodeStatements", ...(said ? cs.slice(1) : cs))));
} else t = api.call("Try", ...positional(t), api.call("Undefined"));
return after ? api.call("Finally", t, await ask("CodeStatements", ...positional(after))) : t;
