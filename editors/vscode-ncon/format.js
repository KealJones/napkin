// @ts-check
/**
 * The .ncon formatter. `node format.js file.ncon...` prints the formatted text, `--write`
 * rewrites the files, and `--check` exits 1 when any would change. The extension formats
 * with it too (Format Document).
 *
 * The rules are the runtime's, not a copy: this loads the build of
 * packages/concept-runtime/src/code/format.ts, which is also what the runtime writes packs
 * with. So what the editor writes and what Napkin writes cannot drift. Run `pnpm build` in
 * packages/concept-runtime after changing the rules.
 */

const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const RUNTIME = join(__dirname, "../../packages/concept-runtime/dist/code/format.js");

/** @type {Promise<{ formatNcon: (text: string) => string, FormatError: new (...args: any[]) => Error }> | undefined} */
let loaded;
const runtime = () => {
  if (!existsSync(RUNTIME)) throw new Error(`the runtime is not built: run pnpm build in packages/concept-runtime (${RUNTIME})`);
  return (loaded ??= import(pathToFileURL(RUNTIME).href));
};

/** A pack's text, formatted. Throws the runtime's FormatError for text that does not parse. */
async function format(/** @type {string} */ text) {
  return (await runtime()).formatNcon(text);
}

/** Whether an error is the formatter saying the text does not parse. */
async function isFormatError(/** @type {unknown} */ error) {
  return error instanceof (await runtime()).FormatError;
}

module.exports = { format, isFormatError, RUNTIME };

if (require.main === module) {
  (async () => {
    const { readFileSync, writeFileSync } = require("node:fs");
    const args = process.argv.slice(2);
    const write = args.includes("--write");
    const check = args.includes("--check");
    let changed = 0;
    for (const file of args.filter((a) => !a.startsWith("--"))) {
      const text = readFileSync(file, "utf8");
      const out = await format(text);
      if (out === text) continue;
      changed++;
      if (write) writeFileSync(file, out);
      else if (check) console.log(`would change: ${file}`);
      else process.stdout.write(out);
    }
    if (check && changed) process.exit(1);
  })();
}
