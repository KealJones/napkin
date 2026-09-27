// "+x" is x as a number, as the language reads it; "a + b" adds.
return parts.length === 1 ? read(parts[0]) : api.call("Add", await read(parts[0]), await read(parts[1]));
