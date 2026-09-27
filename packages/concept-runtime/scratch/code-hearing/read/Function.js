// "function f(a) { ... }": the name, what it takes, and the block it does.
let sig = parts[0];
let block = [];
if (is(sig, "Returns")) { block = positional(sig).filter((x) => is(x, "Block")); sig = positional(sig)[0]; }
if (!isCall(sig)) return api.call("Func", ...parts);
const ps = positional(sig);
const own = ps.filter((x) => is(x, "Block"));
const blk = [...own, ...block][0];
const params = ps.filter((x) => !is(x, "Block") && !is(x, "Parens") && !is(x, "Angles"));
const out = [];
for (const x of params) out.push(await ask("CodeTarget", x));
const statements = blk ? positional(blk) : parts.slice(1);
return api.call("Func", variable(sig), api.call("List", ...out), await ask("CodeBody", ...statements));
