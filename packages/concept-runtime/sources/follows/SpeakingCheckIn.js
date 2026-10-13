// @realization CheckIn($told), context = Speaking(), evaluateArguments = false
// Asking after something told before: about someone or something of theirs ("your mom is sick"),
// how it is ("How is your mom doing?"); about themselves ("you lost your job"), how things have
// been since. What it is about is read by the tagger: the words before the doing.
async (args, bindings, api) => {
  const told = args[0] ? args[0].value : undefined;
  if (typeof told !== "string" || !told) return "";
  const ws = api.words(told);
  const first = ws[0];
  if (!first) return "";
  if (first.tags.includes("Possessive")) {
    const whose = [first.text.toLowerCase()];
    for (const w of ws.slice(1)) {
      if (w.tags.includes("Verb")) break;
      whose.push(w.text.toLowerCase());
    }
    return whose.length > 1 ? "By the way, how is " + whose.join(" ") + " doing?" : "";
  }
  // How they felt ("you were so sad": "you", a "be", what they were): asked how they feel now.
  if (ws[1] && ws[1].tags.includes("Copula")) return "By the way, how are you feeling now?";
  return "By the way, how have things been since " + told + "?";
};
