// What the Hugging Face dataset server answers for ATOMIC 2020: run in CI (live-probe,
// test=scripts/probe-atomic.mjs), where it can be reached. A search is slow the first time a
// dataset is searched (its index is built), then fast.
const get = async (url) => {
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) }).catch((e) => ({ status: String(e), text: async () => "" }));
  const text = await r.text();
  return { status: r.status, ms: Date.now() - t0, text };
};
for (const dataset of ["Estwld/atomic2020-origin", "Estwld/atomic2020-origin-drop_duplicates"]) {
  const splits = JSON.parse((await get(`https://datasets-server.huggingface.co/splits?dataset=${dataset}`)).text || "{}").splits ?? [];
  console.log(dataset, "splits:", JSON.stringify(splits));
  const s = splits.find((x) => x.split === "train") ?? splits[0];
  if (!s) continue;
  const rows = await get("https://datasets-server.huggingface.co/rows?" + new URLSearchParams({ dataset, config: s.config, split: s.split, offset: "0", length: "3" }));
  console.log("rows", rows.status, rows.ms, "ms", rows.text.slice(0, 900));
  for (const query of ["car breaks down", "car breaks down", "loses job", "gets promoted", "PersonX eats"]) {
    const r = await get("https://datasets-server.huggingface.co/search?" + new URLSearchParams({ dataset, config: s.config, split: s.split, query, length: "5" }));
    console.log(`\n== "${query}" -> ${r.status} in ${r.ms} ms`);
    try {
      const data = JSON.parse(r.text);
      console.log("total:", data.num_rows_total);
      for (const row of (data.rows ?? []).slice(0, 5)) console.log(JSON.stringify(row.row).slice(0, 300));
    } catch {
      console.log(r.text.slice(0, 200));
    }
  }
}
