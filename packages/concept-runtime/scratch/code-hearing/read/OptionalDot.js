// "a?.b": a's member b, if there is an a.
const [owner, member] = parts;
const o = await read(owner);
if (is(member, "Brackets") && positional(member).length === 1) return api.call("OptionalIndex", o, await read(positional(member)[0]));
if (is(member, "Parens")) { const xs = []; for (const x of positional(member)) xs.push(await read(x)); return api.call("OptionalCall", o, ...xs); }
const got = api.call("OptionalMember", o, nameOf(member));
const xs = [];
for (const x of isCall(member) ? positional(member) : []) if (!is(x, "Parens")) xs.push(await read(x));
return isCall(member) && positional(member).length ? api.call("Call", got, ...xs) : got;
