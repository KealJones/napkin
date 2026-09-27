// @realization Explained($code, $words), context = Speaking()
// Code said in words.
async (args, bindings, api) => {
  const w = String(bindings.get("words"));
  return "Here's what it does: " + w + (/[.!?]$/.test(w) ? "" : ".");
};
