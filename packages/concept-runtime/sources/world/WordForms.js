// @realization WordForms($text), context = Execution()
// The forms of a word, from its Wikidata lexeme ("wrote" is a form of write: write, writes, wrote,
// written, writing). List of text, the word itself first; the word alone when no lexeme has it.
async (args, bindings, api) => {
  const text = String(bindings.get("text")).toLowerCase();
  const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&type=lexeme&language=en&limit=3&format=json&search=" + encodeURIComponent(text);
  const found = api.toHost(await api.evaluate(api.call("Fetch", url)));
  const hit = found && Array.isArray(found.search) ? found.search.find((h) => h.match && String(h.match.text).toLowerCase() === text && /verb|noun|adjective/.test(String(h.description))) : undefined;
  if (!hit) return api.call("List", text);
  const got = api.toHost(await api.evaluate(api.call("Fetch", "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + hit.id)));
  const lexeme = got && got.entities ? got.entities[hit.id] : undefined;
  const forms = lexeme && Array.isArray(lexeme.forms) ? lexeme.forms.map((f) => f.representations && f.representations.en && f.representations.en.value).filter((v) => typeof v === "string") : [];
  return api.call("List", ...[text, ...forms.filter((f) => f !== text)]);
};
