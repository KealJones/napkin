// What the Hugging Face dataset server answers for ATOMIC: run in CI (live-probe, test=scripts/probe-atomic.mjs),
// where it can be reached. Prints the columns and a few rows for a few events.
const ask = async (path, params) => {
  const url = `https://datasets-server.huggingface.co/${path}?` + new URLSearchParams(params);
  const t0 = Date.now();
  const r = await fetch(url);
  const text = await r.text();
  console.log(`\n== ${path} ${JSON.stringify(params)} -> ${r.status} in ${Date.now() - t0} ms`);
  return text;
};
for (const dataset of ["ysginc/atomic", "allenai/atomic"]) {
  console.log((await ask("is-valid", { dataset })).slice(0, 300));
  console.log((await ask("splits", { dataset })).slice(0, 600));
}
for (const query of ["PersonX eats", "car breaks down", "PersonX loses PersonX's job", "PersonX gets promoted"]) {
  const text = await ask("search", { dataset: "ysginc/atomic", config: "default", split: "train", query, length: "5" });
  try {
    const data = JSON.parse(text);
    console.log("features:", (data.features ?? []).map((f) => f.name).join(", "), "| total:", data.num_rows_total);
    for (const row of (data.rows ?? []).slice(0, 5)) console.log(JSON.stringify(row.row).slice(0, 700));
    if (data.error) console.log("error:", data.error);
  } catch {
    console.log(text.slice(0, 600));
  }
}
