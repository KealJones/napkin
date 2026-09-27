// "(a, b) => a + b": a function of its parameters; a block after it is its body.
if (parts.length < 2) return self;
const [ps, b] = parts;
let head = ps;
let async = false;
if (is(head, "Returns")) head = positional(head)[0];
if (is(head, "Async")) { async = true; head = positional(head)[0] ?? api.call("Parens"); }
const params = await ask("CodeParams", head);
const body = is(b, "Block") ? await ask("CodeBody", ...positional(b)) : await read(b);
const f = api.call("Lambda", params, body);
return async ? api.call("Async", f) : f;
