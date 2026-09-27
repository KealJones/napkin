// "while (c) ...": while c holds, its body.
return api.call("While", await read(parts[0]), await ask("CodeStatements", ...parts.slice(1)));
