// The runtime's version, written into src/version.ts before each build: the package's version,
// and the commit it was built from (GITHUB_SHA in CI, else git, with "dirty" when the tree has
// changes not committed). Shown by the studio and written into every graph file, so a graph can
// be traced to the runtime that made it.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const git = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};
const sha = (process.env.GITHUB_SHA ?? git("rev-parse HEAD")).slice(0, 7);
const dirty = !process.env.GITHUB_SHA && git("status --porcelain -- .") !== "";
const commit = sha ? sha + (dirty ? "-dirty" : "") : "unknown";
const text = `// Written by scripts/version.mjs before each build; not edited by hand, not committed.
export const RUNTIME_VERSION = ${JSON.stringify(version)};
export const RUNTIME_COMMIT = ${JSON.stringify(commit)};
/** "0.2.0+cdc98c3": the version, and the commit it was built from. */
export const RUNTIME_BUILD = \`\${RUNTIME_VERSION}+\${RUNTIME_COMMIT}\`;
`;
const path = join(root, "src", "version.ts");
let old = "";
try {
  old = readFileSync(path, "utf8");
} catch {}
if (old !== text) writeFileSync(path, text);
