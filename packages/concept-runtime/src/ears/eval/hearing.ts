/**
 * Prompt hearing measured against the rules parser (design/prompt-hearing.md, stage 0).
 *
 * The rules reading is the reference while the rules parser answers. For each message it
 * reports whether the Prompt reading is the same, and how many of the rules reading's links
 * (a head and one of its arguments) the Prompt reading also has, so progress shows long
 * before readings match exactly.
 *
 *   node dist/ears/eval/hearing.js [--label name] [--show]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Expr, c, call, format, isCall, parse, walk } from "../../concept/expression.js";
import { seed } from "../../seed/seed.js";
import { ConceptStore } from "../../store/store.js";
import { Runtime } from "../../runtime/evaluator.js";
import { parseRules } from "../parser/rules.js";
import { loadGold } from "./gold.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every message the rules parser is tested or scored on. */
function messages(): string[] {
  const found = new Set<string>();
  const cases = JSON.parse(readFileSync(join(ROOT, "eval/ears/cases.json"), "utf8")) as { message: string }[];
  for (const x of cases) found.add(x.message);
  for (const x of loadGold(join(ROOT, "eval/ears/gold.md"))) found.add(x.message);
  const tests = readFileSync(join(ROOT, "src/ears/parser/rules.test.ts"), "utf8");
  for (const m of tests.matchAll(/(?:read|lines)\("((?:[^"\\]|\\.)*)"\)/g)) found.add(JSON.parse(`"${m[1]}"`));
  return [...found].filter((m) => m.trim() && !m.includes("```"));
}

const unmood = (e: Expr): Expr => (isCall(e) && e.head === "Mood" && e.args.length === 2 ? e.args[1].value : e);

/** A reading's links: each head with each argument's head, as "Parent>Child". */
function links(roots: readonly Expr[]): string[] {
  const out: string[] = [];
  const label = (e: Expr) => (isCall(e) ? e.head : typeof e === "object" && e !== null ? "$" : String(e));
  for (const root of roots) for (const node of walk(root)) if (isCall(node)) for (const a of node.args) out.push(`${node.head}>${label(a.value)}`);
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : new Date().toISOString().replace(/[:.]/g, "-");
  const store = new ConceptStore();
  seed(store);
  const rows: { message: string; rules: string; prompt: string; same: boolean; recall: number }[] = [];
  for (const message of messages()) {
    const ruled = parseRules(message).reading?.lines ?? [];
    let rules: Expr[];
    try {
      rules = ruled.filter((l) => !l.startsWith("$")).map((l) => unmood(parse(l)));
    } catch {
      continue;
    }
    const heard = await new Runtime(store).evaluate(call("Hear", [{ value: message }]), c("Execution"));
    const prompt = isCall(heard) && heard.head === "Phrases" ? heard.args.map((a) => a.value) : [heard];
    const want = links(rules);
    const have = new Set(links(prompt));
    const recall = want.length ? want.filter((l) => have.has(l)).length / want.length : 1;
    const same = rules.map(format).join(" | ") === prompt.map(format).join(" | ");
    rows.push({ message, rules: rules.map(format).join(" | "), prompt: prompt.map(format).join(" | "), same, recall });
    if (args.includes("--show")) console.log(`${same ? "=" : " "} ${recall.toFixed(2)}  ${message}\n    rules:  ${rows.at(-1)!.rules}\n    prompt: ${rows.at(-1)!.prompt}`);
  }
  const same = rows.filter((r) => r.same).length;
  const recall = rows.reduce((n, r) => n + r.recall, 0) / (rows.length || 1);
  console.log(`${rows.length} messages: ${same} read the same (${((100 * same) / (rows.length || 1)).toFixed(1)}%), link recall ${(100 * recall).toFixed(1)}%`);
  const out = join(ROOT, "eval/ears/results");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `hearing-${label}.json`), JSON.stringify({ label, same, recall, rows }, null, 2));
}

await main();
