// "if" holds a condition, then what to do, then (after "else") what to do otherwise.
const [condition, ...rest] = parts;
const last = rest[rest.length - 1];
const otherwise = is(last, "Else") ? positional(rest.pop()) : [];
return api.call("If", await read(condition), await ask("CodeStatements", ...rest), await ask("CodeStatements", ...otherwise));
