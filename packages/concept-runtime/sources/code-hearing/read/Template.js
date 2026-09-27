// "`a${b}c`": its pieces of text and what is between them, joined.
let acc = await read(parts[0]);
for (let i = 1; i < parts.length; i += 2) {
  acc = api.call("Add", acc, await read(parts[i]));
  if (parts[i + 1] !== undefined && parts[i + 1] !== "") acc = api.call("Add", acc, parts[i + 1]);
}
return acc;
