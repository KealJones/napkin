// "var y": y, holding nothing yet.
return parts.length === 1 ? api.call("Var", await ask("CodeTarget", parts[0]), api.call("Undefined")) : api.call("Var", ...parts);
