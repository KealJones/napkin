// What the Hugging Face dataset server answers for ATOMIC 2020: run in CI (live-probe,
// test=scripts/probe-atomic.mjs), where it can be reached. The events of the rows a search finds.
const get = async (url) => {
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) }).catch((e) => ({ status: String(e), json: async () => ({}) }));
  return { status: r.status, ms: Date.now() - t0, body: await r.json().catch(() => ({})) };
};
const dataset = "Estwld/atomic2020-origin";
for (const query of ["PersonX car break down", "car breaks down", "PersonX dog die", "dog dies", "PersonX promote", "gets promoted"]) {
  const r = await get("https://datasets-server.huggingface.co/search?" + new URLSearchParams({ dataset, config: "default", split: "train", query, length: "100" }));
  const events = new Map();
  for (const row of r.body.rows ?? []) events.set(row.row.event, (events.get(row.row.event) ?? 0) + 1);
  console.log(`\n== "${query}" -> ${r.status} in ${r.ms} ms, ${r.body.num_rows_total} rows; events:`, [...events].slice(0, 25).map(([e, n]) => `${e} (${n})`).join(" | "));
}
