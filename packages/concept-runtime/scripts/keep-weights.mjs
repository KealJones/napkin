// Learned weights kept as a pack: node scripts/keep-weights.mjs <weights.json> [how learned]
// Writes sources/situations/header.ncon with Situations Weighs("feature", value) for each weight
// learned away from the prior (situation.ts PRIOR), then build it: node scripts/pack.mjs
// sources/situations situations.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PRIOR } from "../dist/situation/situation.js";

const [file, how = "learned from worked examples"] = process.argv.slice(2);
const w = JSON.parse(readFileSync(file, "utf8"));
const moved = Object.entries(w).filter(([k, v]) => Math.abs(v - (PRIOR[k] ?? 0)) > 0.05).sort(([a], [b]) => a.localeCompare(b));
const lines = [
  "// How situations are weighed, learned: each Weighs(\"feature\", value) replaces the prior weight of",
  `// that feature (src/situation/situation.ts PRIOR). ${how}. Written by scripts/keep-weights.mjs.`,
  "Requires(Core(), Basic())",
  "",
  "Concept(Weighs(), IsA(Relation()))",
  "",
  ...moved.map(([k, v]) => `Concept(Situations(), Weighs(${JSON.stringify(k)}, ${Math.round(v * 1000) / 1000}))\n`),
];
mkdirSync("sources/situations", { recursive: true });
writeFileSync("sources/situations/header.ncon", lines.join("\n"));
console.log(`${moved.length} weights kept`);
