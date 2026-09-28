// @realization Put($said), context = Interrogative(), evaluateArguments = false
// "can you put cheetos to my shopping list": put on the list it names. Asked for or told, not
// worked out, so hearing still reads Put as taking two things.
async (args, bindings, api) => {
  const said = bindings.get("said");
  const done = await api.evaluate(api.call("ListChange", api.call("Add"), said), api.context);
  return done && done.head === "ListChange" ? api.call("Put", said) : done;
};
