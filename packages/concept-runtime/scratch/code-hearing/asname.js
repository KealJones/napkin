async (args, bindings, api) => {
  // A word of the language used as a name is only a name: typed other than as its Concept's
  // plain name ("Set" beside "set"), a member's name ("x.set"), a key ("{ default: 1 }"), what
  // a member is of ("type.name"), or, for a word of the language only where it is not a name,
  // called ("get(x)").
  const self = bindings.get("word");
  const at = self.args[1].value;
  const words = api.cells.read(self.args[0].value).args;
  const field = {};
  for (const a of api.cells.read(self.args[3].value).args) field[a.name] = a.value;
  // Each field is a List, one entry a word.
  const v = (k, i) => api.lists.at(field[k], i);
  const is = (i, k) => i >= 0 && i < api.lists.size(field.kinds) && v("kinds", i).args.some((a) => a.value === k);
  const text = (i) => (i >= 0 && i < words.length ? words[i].value.args[0].value : "");
  const head = v("heads", at);
  if (!is(at, "Name") || !head) return api.call("List");
  const typed = text(at) !== head[0].toLowerCase() + head.slice(1);
  const member = text(at - 1) === "." || text(at - 1) === "?.";
  const key = text(at + 1) === ":" && (text(at - 1) === "{" || text(at - 1) === ",");
  const owner = text(at + 1) === "." && !is(at, "Infix");
  const called = is(at, "Contextual") && text(at + 1) === "(";
  return typed || member || key || owner || called ? api.call("List", api.call("Sense", at, api.call("Name"))) : api.call("List");
}
