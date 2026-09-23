/**
 * Ears lab: edit the parser's system prompt, try it on one message, and run it against the
 * eval cases and the gold map. Nothing here saves the prompt; a winning change is copied
 * into `packages/concept-runtime/src/ears/prompt.ts` by hand, after reading AGENTS.md there.
 * Every eval run is saved with its prompt, and every conversion is logged, so both can be
 * looked back at here.
 */
import { useEffect, useState } from "react";

type Summary = {
  headline: number;
  retained: number;
  copyRate: number;
  match: number;
  order: number;
  ms: number;
  bySource: Record<string, number>;
  byCheck: Record<string, number>;
};
type Backend = "model" | "rules" | "hybrid";
const READERS: { value: Backend; label: string; title: string }[] = [
  { value: "model", label: "LLM", title: "The model reads every message, with the prompt on the left." },
  { value: "rules", label: "Rules", title: "The deterministic parser reads every message. The prompt is not used." },
  { value: "hybrid", label: "Hybrid", title: "The rules read first; the model reads only what the rules refuse." },
];
/** Who read a run, from the share of readings the rules produced. */
const readerOf = (ruled: number | undefined) => (ruled === undefined || ruled === 0 ? "LLM" : ruled === 1 ? "Rules" : `Hybrid (${Math.round(ruled * 100)}% rules)`);

type Converted = {
  raw: string;
  backend: "model" | "rules";
  fallback: string | null;
  lifted: string | null;
  reading: string | null;
  problems: string[];
  rejected: { line: string; reason: string }[];
  ms: number;
};
type CaseView = {
  id: string;
  source: string;
  message: string;
  rate: number;
  failed: string[];
  readings: string[];
  gold: string | null;
  expect: Record<string, unknown> | null;
};
type Done = {
  file: string;
  summary: Summary;
  baseline: { label: string; shared: number; before: Summary; after: Summary } | null;
  cases: CaseView[];
};
type RunRow = {
  file: string;
  label: string;
  date: string;
  promptHash: string;
  promptChars: number;
  unfused: boolean;
  cases: number;
  samples: number;
  headline: number;
  retained: number;
  order: number;
  match: number;
  copyRate: number;
  ruled?: number;
};
type RunDetail = { label: string; date: string; prompt: string; unfused: boolean; summary: Summary; cases: CaseView[] };
type Conversion = { date: string; promptHash: string; message: string; raw: string; reading: string | null };

const pct = (n: number | undefined) => (n === undefined ? "--" : `${Math.round(n * 100)}%`);
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Delta({ before, after, lowerIsBetter = false }: { before: number | undefined; after: number | undefined; lowerIsBetter?: boolean | undefined }) {
  if (before === undefined || after === undefined) return <span className="lab-muted">--</span>;
  const d = after - before;
  const better = lowerIsBetter ? d < -0.005 : d > 0.005;
  const worse = lowerIsBetter ? d > 0.005 : d < -0.005;
  return (
    <span className={better ? "lab-good" : worse ? "lab-bad" : "lab-muted"}>
      {d > 0 ? "+" : ""}
      {Math.round(d * 100)}
    </span>
  );
}

/** Each case's reading next to what it was scored against. */
function CaseList({ cases = [] }: { cases?: CaseView[] | undefined }) {
  const [show, setShow] = useState<"failing" | "all">("failing");
  const [query, setQuery] = useState("");
  const shown = cases.filter(
    (c) =>
      (show === "all" || c.rate < 1) &&
      (!query || c.id.includes(query) || c.message.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <div className="lab-out">
      <div className="lab-row">
        <label>
          Show{" "}
          <select value={show} onChange={(e) => setShow(e.target.value as "failing" | "all")}>
            <option value="failing">failing ({cases.filter((c) => c.rate < 1).length})</option>
            <option value="all">all ({cases.length})</option>
          </select>
        </label>
        <input className="lab-search" placeholder="filter by id or message" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="lab-cases">
        {shown.map((c) => (
          <li key={c.id}>
            <div className="lab-case-head">
              <span className={c.rate === 1 ? "lab-good" : "lab-bad"}>{pct(c.rate)}</span> <b>{c.id}</b>{" "}
              <span className="lab-muted">{c.source}</span>
            </div>
            <div className="lab-case-message">{c.message}</div>
            <div className="lab-pair">
              <div>
                <label>Reading</label>
                {[...new Set(c.readings)].map((r, i) => (
                  <pre key={i}>{r}</pre>
                ))}
              </div>
              <div>
                <label>{c.gold ? "Gold" : "Checks"}</label>
                <pre className="lab-gold">{c.gold ?? JSON.stringify(c.expect, null, 1)}</pre>
              </div>
            </div>
            {c.failed.length > 0 && <div className="lab-muted">failed: {c.failed.join(", ")}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EarsLab() {
  const [backend, setBackend] = useState<Backend>(() => (localStorage.getItem("ears-lab-backend") as Backend | null) ?? "model");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("what day will it be in 5 days?");
  const [converted, setConverted] = useState<Converted | null>(null);
  const [converting, setConverting] = useState(false);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [samples, setSamples] = useState(1);
  const [scope, setScope] = useState("");
  const [unfused, setUnfused] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; id: string } | null>(null);
  const [live, setLive] = useState<{ id: string; rate: number; reading: string }[]>([]);
  const [result, setResult] = useState<Done | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [viewing, setViewing] = useState<(RunDetail & { file: string }) | null>(null);
  const [error, setError] = useState("");

  const refreshRuns = () =>
    void fetch("/api/ears/runs")
      .then((r) => r.json())
      .then((d: { runs?: RunRow[] }) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]));
  const refreshConversions = () =>
    void fetch("/api/ears/conversions")
      .then((r) => r.json())
      .then((d: { conversions?: Conversion[] }) => setConversions(d.conversions ?? []))
      .catch(() => setConversions([]));

  useEffect(() => {
    void fetch("/api/ears/prompt")
      .then((r) => r.json())
      .then((d: { prompt: string }) => {
        setDefaultPrompt(d.prompt);
        setPrompt(d.prompt);
      });
    refreshRuns();
    refreshConversions();
  }, []);

  const edited = prompt !== defaultPrompt;
  const system = edited ? prompt : undefined;
  const pickBackend = (next: Backend) => {
    localStorage.setItem("ears-lab-backend", next);
    setBackend(next);
    setConverted(null);
  };

  async function convert() {
    setConverting(true);
    setError("");
    try {
      const r = await fetch("/api/ears/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, system, backend }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? r.statusText);
      setConverted(d as Converted);
      refreshConversions();
    } catch (e) {
      setError(String(e));
    } finally {
      setConverting(false);
    }
  }

  async function runEval() {
    setError("");
    setResult(null);
    setLive([]);
    setProgress({ done: 0, total: 0, id: "" });
    try {
      const questions = scope === "questions";
      const only = scope && !questions ? scope : undefined;
      const r = await fetch("/api/ears/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system, samples: backend === "rules" ? 1 : samples, only, questions, unfused, backend }),
      });
      if (!r.ok || !r.body) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? r.statusText);
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
          if (event.type === "case") {
            setProgress({ done: event.done as number, total: event.total as number, id: event.id as string });
            setLive((xs) => [{ id: event.id as string, rate: event.rate as number, reading: event.reading as string }, ...xs].slice(0, 12));
          } else if (event.type === "done") {
            const done = event as unknown as Partial<Done>;
            setResult({ file: done.file ?? "", summary: done.summary!, baseline: done.baseline ?? null, cases: done.cases ?? [] });
            refreshRuns();
          } else if (event.type === "error") {
            setError(event.error as string);
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setProgress(null);
    }
  }

  async function openRun(file: string, asUnfused?: boolean) {
    const q = asUnfused === undefined ? "" : `?unfused=${asUnfused ? 1 : 0}`;
    const r = await fetch(`/api/ears/runs/${encodeURIComponent(file)}${q}`);
    const d = (await r.json()) as RunDetail;
    setViewing({ ...d, file });
  }

  const b = result?.baseline;
  const rows: [string, keyof Summary, boolean?][] = [
    ["Pass (headline)", "headline"],
    ["Words kept", "retained"],
    ["Word order kept", "order"],
    ["Gold name match", "match"],
    ["Copied from prompt", "copyRate", true],
  ];

  return (
    <section className="page active lab">
      <div className="lab-grid">
        <div className="lab-head lab-reader">
        <strong>Reader</strong>
        <div className="lab-toggle" role="radiogroup" aria-label="Reader">
          {READERS.map((x) => (
            <button
              key={x.value}
              role="radio"
              aria-checked={backend === x.value}
              className={backend === x.value ? "active" : "ghost"}
              title={x.title}
              disabled={progress !== null || converting}
              onClick={() => pickBackend(x.value)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <span className="lab-muted">{READERS.find((x) => x.value === backend)?.title}</span>
        </div>
        <div className={backend === "rules" ? "lab-col lab-unused" : "lab-col"}>
          <div className="lab-head">
            <strong>System prompt</strong>
            <span className="lab-muted">
              {prompt.length} chars {edited ? "· edited (not saved anywhere)" : "· current prompt.ts"}
              {backend === "rules" ? " · not used by the rules" : backend === "hybrid" ? " · used only when the rules refuse" : ""}
            </span>
            <button className="ghost" disabled={!edited} onClick={() => setPrompt(defaultPrompt)}>
              Reset
            </button>
          </div>
          <textarea className="lab-prompt" spellCheck={false} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>

        <div className="lab-col">
          <div className="lab-card">
            <div className="lab-head">
              <strong>Try one message</strong>
            </div>
            <textarea className="lab-message" value={message} onChange={(e) => setMessage(e.target.value)} />
            <button disabled={converting || !message.trim()} onClick={() => void convert()}>
              {converting ? "Converting..." : "Convert"}
            </button>
            {converted && (
              <div className="lab-out">
                <label>
                  {converted.backend === "rules" ? "Rules wrote" : "Model wrote"} ({converted.ms} ms)
                  {converted.fallback ? (converted.backend === "model" ? ` · rules refused (${converted.fallback}), so the model read it` : ` · rules refused (${converted.fallback})`) : ""}
                </label>
                <pre>{converted.raw || "(nothing)"}</pre>
                <label>After mechanical passes (mood, repairs)</label>
                <pre className="lab-reading">{converted.reading ?? "(nothing parsed)"}</pre>
                {converted.problems.length > 0 && <div className="lab-bad">{converted.problems.join("; ")}</div>}
                {converted.rejected.map((r) => (
                  <div className="lab-bad" key={r.line}>
                    rejected: {r.line} ({r.reason})
                  </div>
                ))}
              </div>
            )}
            {conversions.length > 0 && (
              <details>
                <summary className="lab-muted">Recent conversions ({conversions.length})</summary>
                <ul className="lab-live">
                  {conversions.map((c) => (
                    <li key={c.date} title={`prompt ${c.promptHash} · ${when(c.date)}`}>
                      <button className="lab-link" onClick={() => setMessage(c.message)}>
                        {c.message}
                      </button>
                      <br />
                      <code>{c.reading ?? c.raw}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="lab-card">
            <div className="lab-head">
              <strong>Run against cases and gold</strong>
            </div>
            <div className="lab-row">
              <label>
                Samples{" "}
                <select value={backend === "rules" ? 1 : samples} disabled={backend === "rules"} title={backend === "rules" ? "The rules read the same way every time." : ""} onChange={(e) => setSamples(Number(e.target.value))}>
                  <option value={1}>1 (fast, noisy)</option>
                  <option value={3}>3 (like the CLI)</option>
                </select>
              </label>
              <label>
                Cases{" "}
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">all</option>
                  <option value="gold">gold only</option>
                  <option value="questions">questions only</option>
                  <option value="heldout">held-out only</option>
                </select>
              </label>
              <label title="Score against gold readings with fused names written out: WhoDid(a, b) as Who(Did(a, b)), WhatIs(x) as What(Is(x)), IsA(x) as Is(x), DoNot(x) as Do(Not(x)).">
                <input type="checkbox" checked={unfused} onChange={(e) => setUnfused(e.target.checked)} /> gold without fused words
              </label>
              <button disabled={progress !== null} onClick={() => void runEval()}>
                {progress ? `Running ${progress.done}/${progress.total || "?"}` : "Run eval"}
              </button>
            </div>
            {progress && progress.total > 0 && (
              <div className="lab-bar">
                <div style={{ width: `${(100 * progress.done) / progress.total}%` }} />
              </div>
            )}
            {live.length > 0 && !result && (
              <ul className="lab-live">
                {live.map((x) => (
                  <li key={x.id}>
                    <span className={x.rate === 1 ? "lab-good" : "lab-bad"}>{pct(x.rate)}</span> {x.id} <code>{x.reading}</code>
                  </li>
                ))}
              </ul>
            )}
            {result && (
              <div className="lab-out">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th />
                      <th>{b ? b.label : "baseline"}</th>
                      <th>this run ({READERS.find((x) => x.value === backend)?.label})</th>
                      <th>change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([name, key, lower]) => (
                      <tr key={key}>
                        <td>{name}</td>
                        <td>{pct(b?.before[key] as number | undefined)}</td>
                        <td>{pct((b?.after ?? result.summary)[key] as number)}</td>
                        <td>
                          <Delta before={b?.before[key] as number | undefined} after={b?.after[key] as number | undefined} lowerIsBetter={lower} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="lab-muted">
                  {b
                    ? `Compared over the ${b.shared} cases both runs share; the baseline is the last saved CLI run, re-scored under the same gold${unfused ? " (unfused)" : ""}.`
                    : "No saved baseline run to compare against."}{" "}
                  Saved as {result.file}.
                </div>
                <CaseList cases={result.cases} />
              </div>
            )}
          </div>

          <div className="lab-card">
            <div className="lab-head">
              <strong>Past runs</strong>
              <span className="lab-muted">re-scored under the current gold</span>
              <button className="ghost" onClick={refreshRuns}>
                Refresh
              </button>
            </div>
            <table className="lab-table lab-runs">
              <thead>
                <tr>
                  <th>when</th>
                  <th>label</th>
                  <th>reader</th>
                  <th>chars</th>
                  <th>pass</th>
                  <th>kept</th>
                  <th>order</th>
                  <th>gold</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.file} className={viewing?.file === r.file ? "lab-selected" : ""} title={`${r.cases} cases, ${r.samples} samples, prompt ${r.promptHash}`}>
                    <td>{when(r.date)}</td>
                    <td>
                      {r.label}
                      {r.unfused ? " (unfused)" : ""}
                    </td>
                    <td>{readerOf(r.ruled)}</td>
                    <td>{r.promptChars}</td>
                    <td>{pct(r.headline)}</td>
                    <td>{pct(r.retained)}</td>
                    <td>{pct(r.order)}</td>
                    <td>{pct(r.match)}</td>
                    <td>
                      <button className="lab-link" onClick={() => void openRun(r.file)}>
                        view
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {viewing && (
              <div className="lab-out">
                <div className="lab-head">
                  <strong>
                    {viewing.label} · {when(viewing.date)}
                  </strong>
                  <button onClick={() => setPrompt(viewing.prompt)}>Load prompt into editor</button>
                  <button className="ghost" onClick={() => void openRun(viewing.file, !viewing.unfused)}>
                    {viewing.unfused ? "Score against fused gold" : "Score against unfused gold"}
                  </button>
                  <button className="ghost" onClick={() => setViewing(null)}>
                    Close
                  </button>
                </div>
                <div className="lab-muted">
                  pass {pct(viewing.summary.headline)} · kept {pct(viewing.summary.retained)} · order {pct(viewing.summary.order)} · gold{" "}
                  {pct(viewing.summary.match)} {viewing.unfused ? "(unfused gold)" : ""}
                </div>
                <details>
                  <summary className="lab-muted">Prompt ({viewing.prompt.length} chars)</summary>
                  <pre>{viewing.prompt}</pre>
                </details>
                <CaseList cases={viewing.cases} />
              </div>
            )}
          </div>
          {error && <div className="lab-bad">{error}</div>}
        </div>
      </div>
    </section>
  );
}
