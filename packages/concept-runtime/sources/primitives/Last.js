// @realization Last($text), context = Execution(), types = Types(text = String())
// The last letter of text. A distinct variable name from the list realization's $xs, so
// forget() (packs/store/forget.ts groups by formatted pattern) never treats these two
// same-shaped, differently-typed realizations as a shadowing pair.
async (args, bindings, api) => {
  const text = bindings.get("text");
  return text.length ? text[text.length - 1] : api.call("Nothing");
};
