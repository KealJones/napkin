/**
 * The Ears eval core: run cases through the real `hear`, score them, save, re-score, and
 * compare. The CLI (`run.ts`) and the studio's Ears lab both drive this, so a score in the
 * lab and a score from `pnpm eval:ears` mean the same thing.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { type Expr, call, format, parse } from "../../concept/expression.js";
import { seed } from "../../seed/seed.js";
import { ConceptStore } from "../../store/store.js";
import { hear, looksLikeQuestion, read as readRaw } from "../ears.js";
import { DEFAULTS } from "../ollama.js";
import { earsPrompt } from "../prompt.js";
import { loadGold } from "./gold.js";
import { type EvalCase, type Score, family, namesIn, passed, score } from "./score.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const CASES = join(ROOT, "eval/ears/cases.json");
const GOLD = join(ROOT, "eval/ears/gold.md");
export const RESULTS = join(ROOT, "eval/ears/results");

export interface Sample extends Score {
  raw: string;
  reading: string | null;
  ms: number;
  backend?: "rules" | "model";
  fallback?: string;
}

export interface CaseResult {
  id: string;
  source: EvalCase["source"];
  status?: EvalCase["status"];
  /** The prompt shows this message as an example, so passing it proves little. */
  inPrompt: boolean;
  message: string;
  /** The gold reading, when the case has one. */
  target?: string;
  samples: Sample[];
}

export interface Run {
  label: string;
  date: string;
  model: string;
  samples: number;
  promptHash: string;
  promptChars: number;
  prompt: string;
  /** Scored against gold readings with fused names written out. */
  unfused?: boolean;
  cases: CaseResult[];
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(run: Run) {
  const all = run.cases.flatMap((c) => c.samples.map((s) => ({ c, s })));
  const bySource = new Map<string, number[]>();
  const byCheck = new Map<string, number[]>();
  for (const { c, s } of all) {
    const group = c.status === "open" ? "gold open" : c.inPrompt ? "in prompt" : c.source;
    bySource.set(group, [...(bySource.get(group) ?? []), passed(s) ? 1 : 0]);
    const families = new Map<string, boolean>();
    for (const [k, ok] of Object.entries(s.checks)) families.set(family(k), (families.get(family(k)) ?? true) && ok);
    for (const [k, ok] of families) byCheck.set(k, [...(byCheck.get(k) ?? []), ok ? 1 : 0]);
  }
  const unseen = all.filter(({ c }) => !c.inPrompt && c.status !== "open");
  const gold = all.filter(({ s }) => s.match !== undefined);
  return {
    headline: mean(unseen.map(({ s }) => (passed(s) ? 1 : 0))),
    match: mean(gold.map(({ s }) => s.match ?? 0)),
    order: mean(unseen.map(({ s }) => s.order ?? 1)),
    retained: mean(unseen.map(({ s }) => s.retained)),
    copyRate: mean(unseen.map(({ s }) => (s.copied.length ? 1 : 0))),
    ms: mean(all.map(({ s }) => s.ms)),
    /** Share of readings the rules produced, when the rules were in play. */
    ruled: mean(all.map(({ s }) => (s.backend === "rules" ? 1 : 0))),
    bySource: new Map([...bySource].map(([k, v]) => [k, mean(v)])),
    byCheck: new Map([...byCheck].map(([k, v]) => [k, mean(v)])),
  };
}


/** Both summaries over only the cases the two runs share, so adding cases never moves a score. */
export function compare(before: Run, after: Run) {
  const shared = new Set(before.cases.map((c) => c.id).filter((id) => after.cases.some((c) => c.id === id)));
  return {
    shared: shared.size,
    before: summarize({ ...before, cases: before.cases.filter((c) => shared.has(c.id)) }),
    after: summarize({ ...after, cases: after.cases.filter((c) => shared.has(c.id)) }),
  };
}

export const load = (path: string): Run => JSON.parse(readFileSync(path, "utf8")) as Run;

const FUSED = /^(What|Who|When|Where|Why|How|Which)(Is|Are|Was|Were|Did|Do|Does|Will|Would|Can|Could|Should|Has|Have|Had)$/;

/** A fused name written out as its words: WhoDid(a, b) is Who(Did(a, b)), IsA(x) is Is(x). */
function unfuseExpr(e: Expr): Expr {
  if (typeof e !== "object" || e === null || !("head" in e)) return e;
  const args = e.args.map((a) => ({ ...a, value: unfuseExpr(a.value) }));
  const m = FUSED.exec(e.head) ?? /^(What|Who|When|Where|Why|How|Which)([A-Z][A-Za-z]+)$/.exec(e.head);
  if (m && e.head !== "WhichOf" && !/^(Many|Much)$/.test(m[2])) return call(m[1], [{ value: call(m[2], args) }]);
  if (e.head === "DoNot") return call("Do", [{ value: call("Not", args) }]);
  if (e.head === "IsA") return call("Is", args);
  return call(e.head, args);
}

/** A gold reading with every fused name written out, for prompts that do not fuse. */
export function unfuse(target: string): string {
  return target
    .split("\n")
    .map((line) => {
      const bind = /^(\$[A-Za-z_]\w*\s*=\s*)(.*)$/.exec(line);
      try {
        return bind ? bind[1] + format(unfuseExpr(parse(bind[2]))) : format(unfuseExpr(parse(line)));
      } catch {
        return line;
      }
    })
    .join("\n");
}

/**
 * The reading of a saved output. The rules write their own moods, so their lines are not
 * framed again; rules runs saved before they did carry no mood at all, and are framed like
 * the model's. In unfused scoring the reading is unfused too, so both sides are treated alike.
 */
const readFor = (raw: string, message: string, unfused: boolean, backend?: "rules" | "model") => {
  const read = readRaw(raw, message, backend === "rules" && /^Mood\(/m.test(raw));
  return unfused && read.expression !== undefined ? { ...read, expression: unfuseExpr(read.expression) } : read;
};

const withGold = (cases: EvalCase[], unfused: boolean): EvalCase[] =>
  unfused ? cases.map((c) => (c.target === undefined ? c : { ...c, target: unfuse(c.target) })) : cases;

export const currentCases = (): EvalCase[] => [...(JSON.parse(readFileSync(CASES, "utf8")) as EvalCase[]), ...loadGold(GOLD)];

export function save(run: Run): string {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `${run.date.replace(/[:.]/g, "-")}-${run.label}-${run.promptHash}.json`);
  writeFileSync(out, JSON.stringify(run, null, 2));
  return out;
}

/**
 * Expectations change as the gold and the cases are refined. Comparing a run scored under
 * old expectations with one scored under new ones mixes two changes, so an old run's raw
 * outputs are re-scored here under the current ones, through the current repairs.
 */
export function rescore(old: Run, unfused = old.unfused === true): Run {
  const byId = new Map(withGold(currentCases(), unfused).map((c) => [c.id, c]));
  const names = namesIn(old.prompt);
  const cases = old.cases.flatMap((r) => {
    const c = byId.get(r.id);
    if (!c) return [];
    const inPrompt = old.prompt.toLowerCase().includes(`"${c.message.toLowerCase()}"`);
    const samples = r.samples.map((s) => {
      const read = readFor(s.raw, c.message, unfused, s.backend);
      return {
        ...score(c, read, names), raw: s.raw, reading: read.expression === undefined ? null : format(read.expression), ms: s.ms,
        ...(s.backend ? { backend: s.backend } : {}), ...(s.fallback ? { fallback: s.fallback } : {}),
      };
    });
    return [{ ...r, status: c.status, inPrompt, ...(c.target === undefined ? {} : { target: c.target }), samples }];
  });
  return { ...old, label: `${old.label}-rescored`, unfused, cases };
}

/** The newest saved run, optionally only one whose label passes the filter. */
export function latestRun(keep: (label: string) => boolean = () => true): Run | undefined {
  let files: string[];
  try {
    files = readdirSync(RESULTS).filter((f) => f.endsWith(".json")).sort().reverse();
  } catch {
    return undefined;
  }
  for (const f of files) {
    const run = load(join(RESULTS, f));
    if (keep(run.label)) return run;
  }
  return undefined;
}

export interface EarsRunOptions {
  label?: string;
  model?: string;
  samples?: number;
  /** A case id fragment or a source name. */
  only?: string;
  /** Only messages that ask something. */
  questions?: boolean;
  /** A prompt under test, replacing the one built from `prompt.ts`. */
  system?: string;
  /** Score against gold readings with fused names written out. */
  unfused?: boolean;
  /** Who reads: the model (default), the rules, or rules then model. */
  backend?: "model" | "rules" | "hybrid";
  /** Called after each case, for progress. */
  onCase?: (result: CaseResult, done: number, total: number) => void;
}

export async function runEars(options: EarsRunOptions = {}): Promise<Run> {
  const model = options.model ?? DEFAULTS.model;
  const samples = options.samples ?? 3;
  const { only, questions } = options;
  const cases = withGold(currentCases(), options.unfused === true).filter(
    (c) =>
      (!only || c.source === only || c.id.includes(only)) &&
      (!questions || looksLikeQuestion(c.message) || /\b(What|Who|When|Where|Why|How|HowMany|WhichOf|Whether)\(/.test(c.target ?? "")),
  );
  const store = new ConceptStore();
  seed(store);
  const prompt = options.system ?? earsPrompt(store);
  const promptNames = namesIn(prompt);
  const run: Run = {
    label: options.label ?? "run",
    date: new Date().toISOString(),
    model,
    samples,
    promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 10),
    promptChars: prompt.length,
    prompt,
    ...(options.unfused ? { unfused: true } : {}),
    cases: [],
  };

  for (const c of cases) {
    const history = (c.history ?? []).map((h) => ({ message: h.message, result: h.spoken, spoken: h.spoken }));
    const inPrompt = prompt.toLowerCase().includes(`"${c.message.toLowerCase()}"`);
    const result: CaseResult = {
      id: c.id, source: c.source, status: c.status, inPrompt, message: c.message,
      ...(c.target === undefined ? {} : { target: c.target }), samples: [],
    };
    for (let i = 0; i < samples; i += 1) {
      const started = Date.now();
      const heard = await hear(store, c.message, {
        model,
        history,
        ...(options.system ? { system: options.system } : {}),
        // Pinned, like the lab: the eval measures the reader it names, never the chat's default.
        backend: options.backend ?? "model",
      });
      const ms = Date.now() - started;
      const scoredAs = options.unfused && heard.expression !== undefined ? { ...heard, expression: unfuseExpr(heard.expression) } : heard;
      const scored = score(c, scoredAs, promptNames);
      result.samples.push({
        ...scored,
        raw: heard.raw,
        reading: scoredAs.expression === undefined ? null : format(scoredAs.expression),
        ms,
        ...(heard.backend ? { backend: heard.backend } : {}),
        ...(heard.fallback ? { fallback: heard.fallback } : {}),
      });
    }
    run.cases.push(result);
    options.onCase?.(result, run.cases.length, cases.length);
  }

  return run;
}

/** Every saved run, newest first, with its file name. */
export function listRuns(): { file: string; run: Run }[] {
  let files: string[];
  try {
    files = readdirSync(RESULTS).filter((f) => f.endsWith(".json") && !f.includes("rescored")).sort().reverse();
  } catch {
    return [];
  }
  return files.map((file) => ({ file, run: load(join(RESULTS, file)) }));
}

/** A saved run by file name, re-scored under the current cases so old and new compare. */
export function openRun(file: string, unfused?: boolean): Run | undefined {
  if (!/^[\w.-]+\.json$/.test(file)) return undefined;
  try {
    const run = load(join(RESULTS, file));
    return rescore(run, unfused ?? run.unfused === true);
  } catch {
    return undefined;
  }
}

const CONVERSIONS = join(RESULTS, "lab-conversions.jsonl");

export interface Conversion {
  date: string;
  promptHash: string;
  message: string;
  raw: string;
  reading: string | null;
}

export function logConversion(entry: Conversion): void {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(CONVERSIONS, JSON.stringify(entry) + "\n", { flag: "a" });
}

export function recentConversions(limit = 30): Conversion[] {
  try {
    return readFileSync(CONVERSIONS, "utf8").trim().split("\n").filter(Boolean).slice(-limit).reverse()
      .map((l) => JSON.parse(l) as Conversion);
  } catch {
    return [];
  }
}

export const hashPrompt = (prompt: string): string => createHash("sha256").update(prompt).digest("hex").slice(0, 10);
