// @realization Remove($said), context = Interrogative(), evaluateArguments = false
// "can you remove cheetos from my shopping list": taken off the list it names. Asked for or told, not
// worked out, so hearing still reads Remove as taking two things.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const done = await api.evaluate(api.call("ListChange", api.call("Remove"), said), api.context);
  return done && done.head === "ListChange" ? api.call("Remove", said) : done;
};
