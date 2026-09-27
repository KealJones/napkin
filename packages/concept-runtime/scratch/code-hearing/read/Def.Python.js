// "def f(a):" and its block: the name, what it takes, what it does.
const sig = parts[0];
const ps = positional(sig);
const blk = ps.find((x) => is(x, "Block"));
const out = [];
for (const x of ps.filter((x) => !is(x, "Block") && !is(x, "Comment") && !is(x, "Parens"))) out.push(await ask("CodeTarget", x));
return api.call("Func", variable(sig), api.call("List", ...out), await ask("CodeBody", ...(blk ? positional(blk) : parts.slice(1))));
