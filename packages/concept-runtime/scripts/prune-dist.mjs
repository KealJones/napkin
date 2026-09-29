// After tsc: take out what dist holds for sources that are gone. tsc writes what src has and
// never deletes, so a test renamed or removed (kinds.test.ts became types.test.ts) kept running
// from dist against the current code, and a passing suite did not mean what it said.
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const src = join(root, "src");
let removed = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    const stem = relative(dist, path).replace(/\.d\.ts(\.map)?$|\.js(\.map)?$/, "");
    if (stem === relative(dist, path)) continue;
    if (!existsSync(join(src, stem + ".ts")) && !existsSync(join(src, stem + ".tsx")) && !existsSync(join(src, stem + ".js"))) {
      rmSync(path);
      removed += 1;
    }
  }
};
if (existsSync(dist)) walk(dist);
if (removed) console.log(`prune-dist: removed ${removed} file(s) with no source`);
