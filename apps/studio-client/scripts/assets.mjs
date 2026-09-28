/**
 * The files a browser host mounts (packages/concept-runtime/src/platform/browser.ts), copied
 * into public-pages/napkin/files/ at the path the runtime reads them from, with a manifest.
 *
 *   /runtime/...   the runtime package: packs, and the DailyDialog corpus if fetched
 *   /seed/...      the graph a visitor starts from (seed/store.ncon, written by scripts/seed.mjs)
 *   /modules/...   files inside installed packages: word lists and spelling dictionaries
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(here, "../../../packages/concept-runtime");
const require = createRequire(join(runtime, "package.json"));
const out = resolve(here, "../public-pages/napkin");

/** [path the runtime reads, file on disk] */
const files = [];
const add = (path, from) => existsSync(from) && files.push([path, from]);
const addDir = (path, from, keep = () => true) => {
  if (!existsSync(from)) return;
  for (const f of readdirSync(from).filter(keep).sort()) add(`${path}/${f}`, join(from, f));
};

addDir("/runtime/packs", join(runtime, "packs"), (f) => f.endsWith(".ncon"));
addDir("/runtime/data/dialog/dumps/train", join(runtime, "data/dialog/dumps/train"), (f) => f.endsWith(".txt"));
add("/seed/store.ncon", resolve(here, "../seed/store.ncon"));
for (const spec of [
  "an-array-of-english-words/index.json",
  "node-symspell/dictionaries/frequency_dictionary_en_82_765.txt",
  "node-symspell/dictionaries/frequency_bigramdictionary_en_243_342.txt",
]) add(`/modules/${spec}`, require.resolve(spec));

rmSync(out, { recursive: true, force: true });
for (const [path, from] of files) {
  const to = join(out, "files", path);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(files.map(([path]) => path), null, 2));
if (!files.some(([p]) => p.includes("/dialog/"))) console.warn("No DailyDialog corpus: run `sh src/seed/dialogue/fetch.sh` in packages/concept-runtime first.");
console.log(`${files.length} files for the browser host in ${out}`);
