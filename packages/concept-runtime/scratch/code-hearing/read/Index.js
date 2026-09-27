// "a[0]": what a holds at 0; "T[]", a type, is kept as said.
return parts.length === 2 ? api.call("Index", await read(parts[0]), await read(parts[1])) : self;
