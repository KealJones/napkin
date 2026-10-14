// @realization PartsOfSpeech($word), context = Execution(), evaluateArguments = false
// What a word can be, as the dictionary (Wiktionary) gives it: every part of speech it has, each
// a word class ("mean" is an Adjective, a Verb and a Noun), kept as CanBe(...) from Wiktionary,
// so the word is asked about once. Hearing picks among them by where the word stands.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  const word = String(api.toHost(bindings.get("word"))).trim().toLowerCase();
  const name = word.split(/[^a-z0-9]+/).filter((p) => p).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  const held = (api.store.get(name)?.relations ?? []).map((r) => r.claim).filter((c) => isCall(c) && c.head === "CanBe" && isCall(c.args[0]?.value));
  if (held.length) {
    return api.call("List", ...held.map((c) => c.args[0].value));
  }
  const url = "https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(word.split(" ").join("_"));
  const got = api.toHost(await api.evaluate(api.call("Fetch", url)));
  const kinds = [];
  for (let e of got && Array.isArray(got.en) ? got.en : []) {
    const k = String(e.partOfSpeech || "").split(/[^A-Za-z]+/).filter((p) => p).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join("");
    if (k && !kinds.includes(k)) {
      kinds.push(k);
    }
  }
  for (let k of kinds) {
    api.store.addRelation(name, api.call("CanBe", api.call(k), api.call("Wiktionary", url)), undefined, api.trace.cause);
  }
  return api.call("List", ...kinds.map((k) => api.call(k)));
};
