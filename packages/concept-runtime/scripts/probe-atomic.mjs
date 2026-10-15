// What the Hugging Face dataset server answers for ATOMIC: run in CI (live-probe, test=scripts/probe-atomic.mjs),
// where it can be reached. Finds the public ATOMIC copies the server can search, and searches them.
const get = async (url) => {
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch((e) => ({ status: String(e), text: async () => "" }));
  const text = await r.text();
  return { status: r.status, ms: Date.now() - t0, text };
};
const listed = JSON.parse((await get("https://huggingface.co/api/datasets?search=atomic&limit=60")).text || "[]");
console.log("datasets named atomic:", listed.map((d) => d.id).join(", "));
const searchable = [];
for (const d of listed) {
  const v = await get(`https://datasets-server.huggingface.co/is-valid?dataset=${encodeURIComponent(d.id)}`);
  if (/"search":true/.test(v.text)) searchable.push(d.id);
  console.log(d.id, v.status, v.text.slice(0, 120));
}
for (const dataset of searchable.slice(0, 6)) {
  const splits = JSON.parse((await get(`https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(dataset)}`)).text || "{}").splits ?? [];
  const s = splits[0];
  if (!s) continue;
  for (const query of ["car breaks down", "PersonX eats"]) {
    const r = await get("https://datasets-server.huggingface.co/search?" + new URLSearchParams({ dataset, config: s.config, split: s.split, query, length: "3" }));
    console.log(`\n== ${dataset} ${s.config}/${s.split} "${query}" -> ${r.status} in ${r.ms} ms`);
    try {
      const data = JSON.parse(r.text);
      console.log("features:", (data.features ?? []).map((f) => f.name).join(", "), "| total:", data.num_rows_total);
      for (const row of (data.rows ?? []).slice(0, 3)) console.log(JSON.stringify(row.row).slice(0, 500));
    } catch {
      console.log(r.text.slice(0, 200));
    }
  }
}
