// What the thing before gives, called.
const xs = []; for (const x of parts.slice(1)) xs.push(await read(x)); return api.call("Call", await read(parts[0]), ...xs);
