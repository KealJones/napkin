// In Python an "if" with no "else" has no otherwise; "elif" goes on as another if.
const [condition, ...rest] = parts;
const last = rest[rest.length - 1];
const tail = is(last, "Else") || is(last, "Elif") ? rest.pop() : undefined;
const then = await ask("CodeStatements", ...rest);
if (!tail) return api.call("If", await read(condition), then);
const otherwise = is(tail, "Elif") ? await read({ head: "If", args: tail.args }) : await ask("CodeStatements", ...positional(tail));
return api.call("If", await read(condition), then, otherwise);
