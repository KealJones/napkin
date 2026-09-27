// "super(a)": the class this extends, called.
const xs = []; for (const x of parts) if (!is(x, "Parens")) xs.push(await read(x)); return parts.length ? api.call("Call", api.call("Super"), ...xs) : api.call("Super");
