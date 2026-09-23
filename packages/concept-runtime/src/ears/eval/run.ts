#!/usr/bin/env node
/**
 * The Ears eval from the command line. The core lives in `harness.ts`.
 *
 *   pnpm eval:ears                          run everything, 3 samples, save results
 *   pnpm eval:ears --samples 1 --only novel quick look at one source (or case id)
 *   pnpm eval:ears --questions              only messages that ask something
 *   pnpm eval:ears --backend hybrid         rules first, the model only where they give up
 *   pnpm eval:ears --compare <results.json> run, then diff against an earlier run
 *   pnpm eval:ears --diff <a.json> <b.json> diff two saved runs, no model calls
 *   pnpm eval:ears --rescore <run.json>     re-score a saved run's raw outputs against the
 *                                           current cases and repairs, no model calls
 *
 * The headline excludes any case whose message the prompt shows as an example, since a
 * model can pass those by copying. They are reported apart, as `in prompt`.
 */
import { DEFAULTS, modelAvailable } from "../ollama.js";
import { type Run, compare, load, mean, rescore, runEars, save, summarize } from "./harness.js";
import { passed } from "./score.js";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);

function report(run: Run): void {
  const s = summarize(run);
  console.log(`\n${run.label}  ${run.model}  ${run.samples} samples  prompt ${run.promptHash} (${run.promptChars} chars)`);
  console.log(`\nHEADLINE (cases not shown in the prompt, not open): ${pct(s.headline)} pass   retained ${pct(s.retained)}   copied ${pct(s.copyRate)}   gold match ${pct(s.match)}   order ${pct(s.order)}   rules ${pct(s.ruled)}   ${Math.round(s.ms)} ms/call`);
  console.log("\nby source");
  for (const [k, v] of s.bySource) console.log(`  ${k.padEnd(11)} ${pct(v)}`);
  console.log("\nby check");
  for (const [k, v] of [...s.byCheck].sort((a, b) => a[1] - b[1])) console.log(`  ${k.padEnd(13)} ${pct(v)}`);
  console.log("\nfailing cases");
  for (const c of run.cases) {
    const rate = mean(c.samples.map((x) => (passed(x) ? 1 : 0)));
    if (rate === 1) continue;
    const failed = new Set(c.samples.flatMap((x) => Object.entries(x.checks).filter(([, ok]) => !ok).map(([k]) => k)));
    console.log(`  ${pct(rate)}  ${c.id}  [${[...failed].join(", ")}]`);
    console.log(`        ${c.samples[0].reading ?? c.samples[0].raw.replace(/\n/g, " | ")}`);
  }
}

/** Compared on the cases both runs share, so adding cases never moves the headline. */
function diff(before: Run, after: Run): void {
  const { shared, before: a, after: b } = compare(before, after);
  const row = (name: string, x: number | undefined, y: number | undefined) => {
    const d = (y ?? 0) - (x ?? 0);
    const sign = d > 0.005 ? "+" : d < -0.005 ? "-" : " ";
    console.log(`  ${sign} ${name.padEnd(28)} ${x === undefined ? "  --" : pct(x)} -> ${y === undefined ? "--" : pct(y)}`);
  };
  console.log(`\nDIFF over ${shared} shared cases  ${before.label} (${before.promptHash}, ${before.promptChars} chars) -> ${after.label} (${after.promptHash}, ${after.promptChars} chars)`);
  row("HEADLINE", a.headline, b.headline);
  row("retained", a.retained, b.retained);
  row("copied (lower is better)", a.copyRate, b.copyRate);
  row("gold name match", a.match, b.match);
  row("word order kept", a.order, b.order);
  row("read by rules", a.ruled, b.ruled);
  for (const k of new Set([...a.bySource.keys(), ...b.bySource.keys()])) row(`source ${k}`, a.bySource.get(k), b.bySource.get(k));
  for (const k of new Set([...a.byCheck.keys(), ...b.byCheck.keys()])) row(`check ${k}`, a.byCheck.get(k), b.byCheck.get(k));
  console.log("\ncases that moved");
  const old = new Map(before.cases.map((c) => [c.id, mean(c.samples.map((x) => (passed(x) ? 1 : 0)))]));
  for (const c of after.cases) {
    const now = mean(c.samples.map((x) => (passed(x) ? 1 : 0)));
    const was = old.get(c.id);
    if (was === undefined || Math.abs(now - was) < 0.34) continue;
    console.log(`  ${now > was ? "+" : "-"} ${pct(was)} -> ${pct(now)}  ${c.id}   ${c.samples[0].reading ?? c.samples[0].raw.replace(/\n/g, " | ")}`);
  }
}

async function main(): Promise<void> {
  if (args[0] === "--diff") {
    diff(load(args[1]), load(args[2]));
    return;
  }
  if (args[0] === "--rescore") {
    const run = rescore(load(args[1]));
    report(run);
    console.log(`\nsaved ${save(run)}`);
    return;
  }
  if (!(await modelAvailable())) throw new Error(`No model endpoint at ${DEFAULTS.endpoint}. Start ollama first.`);
  const run = await runEars({
    label: value("--label"),
    model: value("--model"),
    samples: Number(value("--samples") ?? 3),
    only: value("--only"),
    questions: args.includes("--questions"),
    ...(value("--backend") ? { backend: value("--backend") as "model" | "rules" | "hybrid" } : {}),
    onCase: (r) => process.stderr.write(`${pct(mean(r.samples.map((x) => (passed(x) ? 1 : 0))))}  ${r.id}\n`),
  });
  const out = save(run);
  report(run);
  console.log(`\nsaved ${out}`);
  const against = value("--compare");
  if (against) diff(load(against), run);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
