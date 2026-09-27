// In Python, "for x in xs" loops over the values of xs.
const [header, ...rest] = parts;
if (is(header, "In")) return api.call("ForOf", await ask("CodeTarget", positional(header)[0]), await read(positional(header)[1]), await ask("CodeStatements", ...rest));
return api.call("For", ...parts);
