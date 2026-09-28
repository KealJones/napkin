// @realization Senses($word, $partOfSpeech), context = Execution()
// What the dictionary (Wiktionary) says a word means as a part of speech ("Verb"): every sense, as
// plain text, with where it came from. Senses(word, List(...), from = Wiktionary(url)).
async (args, bindings, api) => {
  const word = String(bindings.get("word")).trim().toLowerCase();
  const pos = String(bindings.get("partOfSpeech"));
  const url = "https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(word.split(" ").join("_"));
  const got = api.toHost(await api.evaluate(api.call("Fetch", url)));
  const entries = got && Array.isArray(got.en) ? got.en.filter((e) => e.partOfSpeech === pos) : [];
  const plain = (html) =>
    String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&[a-z#0-9]+;/g, " ")
      .replace(/\.mw-parser-output[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const senses = entries.flatMap((e) => (e.definitions || []).map((x) => plain(x.definition))).filter((d) => d.length > 2);
  return { head: "Senses", args: [{ value: word }, { value: api.call("List", ...senses) }, { name: "from", value: api.call("Wiktionary", url) }] };
};
