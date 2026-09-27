// Parameters: names, defaults, rest, patterns, their types set aside.
const list = is(parts[0], "Parens") ? positional(parts[0]) : parts;
const out = [];
for (const x of list) out.push(await ask("CodeTarget", x));
return api.call("List", ...out);
