// Whether the Gemini worker answers, and whether it can teach a fact as graph-shaped JSON
// (what Napkin would keep), not a reply to hand back.
const ask = async (text) => {
  const t = Date.now();
  const res = await fetch("https://pocket-gemini.kealjones.workers.dev/v1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }] }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(res.status, `${Date.now() - t}ms`, JSON.stringify(data.candidates?.[0]?.content?.parts ?? data).slice(0, 800));
};
await ask("Hello! Tell me a joke.");
await ask('Teach a knowledge graph the word "gunwale". Reply only JSON: {"isA":[...],"partOf":[...],"usedFor":[...],"definition":"..."} using short lowercase noun phrases.');
await ask('Someone says: "my car broke down". Reply only JSON: {"feels":[...],"wants":[...],"causes":[...]} with short phrases, no sentences.');
