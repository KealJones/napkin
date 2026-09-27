// "new Foo(1)": a new Foo made with 1.
const made = await read(parts[0]); return is(made, "Call") ? api.call("New", ...positional(made)) : api.call("New", made);
