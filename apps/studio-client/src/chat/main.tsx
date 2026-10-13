/**
 * Napkin, the chat: a quiet conversation first. Everything the studio shows about a turn (what was
 * heard, why it was read so, what was looked up, every step that ran) is folded into one line under
 * the reply; tapping it opens the turn's own page, a timeline whose rows open further where there
 * is more to see. Same API as the studio (transport.ts), so it runs against the Node server or,
 * on GitHub Pages, the in-browser host.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { formatExpression, parseExpression, type Expr } from "@napkin/concept-runtime/expression";
import type { TraceEvent } from "@napkin/concept-runtime";
import { RUNTIME_BUILD } from "@napkin/concept-runtime/version";
import { request } from "../transport";
import "./chat.css";

type Summary = { id: string; persistent: boolean; startedAt: string; turns: number; lastMessage?: string };
type Source = { label: string; url: string };
type Stored = { at: string; message: string; parsed: string; result: string; spoken?: string; sources?: Source[] };

/** Everything known about how one turn was answered. */
interface Detail {
  heard?: string | undefined;
  meaning?: string | undefined;
  result?: string | undefined;
  hearing?: string | undefined;
  why: string[];
  /** Where a recalled answer was learned ("You told me ..."). */
  from: string[];
  resolved: { reference: string; to: string }[];
  learned: { how: string; identity: string; detail: string }[];
  gaps: { kind: string; identity: string; expression: string }[];
  problems: string[];
  rejected: { line: string; reason: string }[];
  events: TraceEvent[];
  ms?: number | undefined;
  /** Reloaded from the conversation: only what the turn stored. */
  stored?: boolean;
}

interface Turn {
  id: string;
  said: string;
  reply?: string;
  sources: Source[];
  pending: boolean;
  failed?: string;
  detail: Detail;
}

const empty = (): Detail => ({ why: [], from: [], resolved: [], learned: [], gaps: [], problems: [], rejected: [], events: [] });

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

/* ------------------------------------------------------------------ *
 * Expressions, set out to be read: a call too long for a line breaks its arguments onto lines of
 * their own, indented, so Stated(Mom(), HasProperty(Sick())) stays one line and a trace's long
 * outputs do not run off the screen.
 * ------------------------------------------------------------------ */

function pretty(source: string | Expr | null | undefined, width = 44): string {
  if (source === null || source === undefined) return "";
  let e: Expr;
  try {
    e = typeof source === "string" ? parseExpression(source) : source;
  } catch {
    return String(source);
  }
  const lay = (x: Expr, indent: string): string => {
    const flat = formatExpression(x);
    if (flat.length + indent.length <= width || x === null || typeof x !== "object" || !("head" in x) || !x.args.length) return flat;
    const inner = indent + "  ";
    const args = x.args.map((a) => inner + (a.name ? `${a.name} = ` : "") + lay(a.value, inner).trimStart());
    return `${x.head}(\n${args.join(",\n")}\n${indent})`;
  };
  return lay(e, "");
}

const short = (s: string | undefined, n = 60) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ------------------------------------------------------------------ *
 * Replies: plain text with ``` blocks and `code`, nothing more.
 * ------------------------------------------------------------------ */

function Rich({ text }: { text: string }) {
  const parts = text.split(/```([a-z]*)\n?([\s\S]*?)```/g);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i] ?? "";
    for (const [k, para] of prose.split(/\n{2,}/).entries()) {
      if (!para.trim()) continue;
      out.push(
        <p key={`p${i}-${k}`}>
          {para.split(/(`[^`]+`)/g).map((bit, j) => (bit.startsWith("`") && bit.endsWith("`") && bit.length > 2 ? <code key={j}>{bit.slice(1, -1)}</code> : <span key={j}>{bit}</span>))}
        </p>,
      );
    }
    if (parts[i + 2] !== undefined) {
      out.push(
        <pre key={`c${i}`} data-lang={parts[i + 1] || undefined}>
          <code>{parts[i + 2]!.replace(/\n$/, "")}</code>
        </pre>,
      );
    }
  }
  return <>{out}</>;
}

/* ------------------------------------------------------------------ *
 * Icons: a few strokes, drawn here.
 * ------------------------------------------------------------------ */

const Icon = {
  menu: <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h11M4 17h16" /></svg>,
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  compose: <svg viewBox="0 0 24 24"><path d="M12 20c4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7c0 1.5.5 2.9 1.4 4L4.5 20l3.6-1c1.2.6 2.5 1 3.9 1z" /><path d="M12 10v6M9 13h6" /></svg>,
  up: <svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6" /></svg>,
  close: <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  back: <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>,
  chevron: <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>,
  ear: <svg viewBox="0 0 24 24"><path d="M7 10a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.6 1.4" /><path d="M10 10a2 2 0 0 1 4 0" /></svg>,
  steps: <svg viewBox="0 0 24 24"><path d="M4 7l4 4-4 4M11 17h9" /></svg>,
  dot: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" className="fill" /></svg>,
  book: <svg viewBox="0 0 24 24"><path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" /><path d="M5 16a4 4 0 0 1 4-4h9" /></svg>,
  link: <svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>,
  warn: <svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></svg>,
  answer: <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg>,
  search: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
  studio: <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 4v16" /></svg>,
};

function Dots() {
  return (
    <span className="dots" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * The line under a reply, and the turn's page.
 * ------------------------------------------------------------------ */

function summaryLine(t: Turn): string {
  if (t.pending) return "Thinking";
  if (t.failed) return "Something went wrong";
  const d = t.detail;
  const bits: string[] = [];
  bits.push(d.stored ? "How it answered" : d.hearing === "frames" ? "Read by its senses" : "Heard by rules");
  if (d.events.length) bits.push(`${d.events.length} step${d.events.length === 1 ? "" : "s"}`);
  if (d.learned.length) bits.push(`learned ${d.learned.length}`);
  return bits.join(" · ");
}

type Page =
  | { kind: "turn"; turn: Turn }
  | { kind: "text"; title: string; sections: { label: string; body: string; mono?: boolean }[] }
  | { kind: "steps"; turn: Turn; focus?: string };

interface Row {
  icon: ReactNode;
  title: string;
  sub?: string;
  open?: Page;
  tone?: "warn" | "muted";
  /** The line under it is words to read, not an expression: wrapped, not cut. */
  prose?: boolean;
}

function rowsOf(t: Turn): Row[] {
  const d = t.detail;
  const rows: Row[] = [];
  rows.push({
    icon: Icon.ear,
    title: "Heard",
    sub: short(d.heard || d.meaning || t.said, 80),
    open: {
      kind: "text",
      title: "Heard",
      sections: [
        { label: "You said", body: t.said },
        ...(d.heard ? [{ label: d.hearing === "frames" ? "Read by its senses as" : "Heard by rules as", body: pretty(d.heard), mono: true }] : []),
        ...(d.meaning && d.meaning !== d.heard ? [{ label: "What ran", body: pretty(d.meaning), mono: true }] : []),
      ],
    },
  });
  for (const r of d.resolved) rows.push({ icon: Icon.link, title: `“${r.reference}” is ${r.to}` });
  for (const w of d.why) {
    const stuck = /^Where I got stuck/i.test(w);
    rows.push({ icon: stuck ? Icon.warn : Icon.dot, title: w, tone: stuck ? "warn" : "muted" });
  }
  for (const l of d.learned) rows.push({ icon: Icon.book, title: `Learned ${l.identity}`, sub: `${l.how}${l.detail ? ` · ${l.detail}` : ""}` });
  for (const g of d.gaps) rows.push({ icon: Icon.warn, title: `Couldn't work out ${g.identity}`, sub: g.kind, tone: "warn", open: { kind: "text", title: g.identity, sections: [{ label: "Left undone", body: pretty(g.expression), mono: true }] } });
  for (const p of d.problems) rows.push({ icon: Icon.warn, title: p, tone: "warn" });
  for (const r of d.rejected) rows.push({ icon: Icon.warn, title: `Couldn't read “${short(r.line, 40)}”`, sub: r.reason, tone: "warn" });
  if (d.events.length) {
    const top = d.events.filter((e) => !d.events.some((p) => p.id === e.parentEventId));
    rows.push({
      icon: Icon.steps,
      title: `Ran ${d.events.length} step${d.events.length === 1 ? "" : "s"}`,
      sub: top.map((e) => e.concept).slice(0, 4).join(" → "),
      open: { kind: "steps", turn: t },
    });
  }
  for (const f of d.from) rows.push({ icon: Icon.book, title: f.startsWith("You told me") ? "Known because you told me" : "Known from", sub: f.replace(/^You told me /, ""), prose: true });
  if (d.result) rows.push({ icon: Icon.answer, title: "Answer", sub: short(d.result, 80), open: { kind: "text", title: "Answer", sections: [{ label: "Worked out to", body: pretty(d.result), mono: true }, ...(t.reply ? [{ label: "Said as", body: t.reply }] : [])] } });
  if (d.stored && !d.events.length) rows.push({ icon: Icon.dot, title: "Steps and reasons are kept only for turns seen live", tone: "muted" });
  return rows;
}

function Timeline({ rows, onOpen }: { rows: Row[]; onOpen: (p: Page) => void }) {
  return (
    <ol className="timeline">
      {rows.map((r, i) => {
        const body = (
          <>
            <span className={`tl-icon ${r.tone ?? ""}`}>{r.icon}</span>
            <span className="tl-text">
              <span className={`tl-title ${r.tone ?? ""}`}>{r.title}</span>
              {r.sub ? <span className={`tl-sub ${r.prose ? "prose" : ""}`}>{r.sub}</span> : null}
            </span>
            {r.open ? <span className="tl-chevron">{Icon.chevron}</span> : null}
          </>
        );
        return (
          <li key={i} className={r.open ? "tappable" : ""}>
            {r.open ? (
              <button type="button" onClick={() => onOpen(r.open!)}>
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The steps that ran, as a tree: each a line that opens to what it took, chose and gave. */
function Steps({ events }: { events: TraceEvent[] }) {
  const children = useMemo(() => {
    const by = new Map<string | null, TraceEvent[]>();
    const ids = new Set(events.map((e) => e.id));
    for (const e of events) {
      const parent = e.parentEventId && ids.has(e.parentEventId) ? e.parentEventId : null;
      by.set(parent, [...(by.get(parent) ?? []), e]);
    }
    return by;
  }, [events]);
  return <StepList items={children.get(null) ?? []} children={children} depth={0} />;
}

function StepList({ items, children, depth }: { items: TraceEvent[]; children: Map<string | null, TraceEvent[]>; depth: number }) {
  return (
    <ul className="steps" style={{ ["--depth" as string]: depth }}>
      {items.map((e) => (
        <Step key={e.id} event={e} children={children} depth={depth} />
      ))}
    </ul>
  );
}

function Step({ event, children, depth }: { event: TraceEvent; children: Map<string | null, TraceEvent[]>; depth: number }) {
  const [open, setOpen] = useState(false);
  const [inside, setInside] = useState(depth < 1);
  const kids = children.get(event.id) ?? [];
  const failed = event.outcome === "failure";
  const output = event.output === null ? event.error ?? "" : formatExpression(event.output);
  return (
    <li className="step">
      <div className="step-line">
        <button type="button" className={`step-toggle ${kids.length ? "" : "leaf"} ${inside ? "down" : ""}`} onClick={() => setInside(!inside)} aria-label={inside ? "Hide steps inside" : "Show steps inside"}>
          {kids.length ? Icon.chevron : <i />}
        </button>
        <button type="button" className="step-main" onClick={() => setOpen(!open)}>
          <span className={`step-concept ${failed ? "warn" : ""}`}>{event.concept}</span>
          <span className="step-out">{short(output, 48)}</span>
        </button>
      </div>
      {open ? (
        <div className="step-detail">
          <Field label="Called with" body={pretty(event.input)} />
          {event.selectedRealization ? <Chose realization={event.selectedRealization} /> : null}
          <Field label="In" body={formatExpression(event.useContext)} />
          <Field label="Gave" body={event.output === null ? event.error ?? "nothing" : pretty(event.output)} />
          <p className="step-meta">
            {event.outcome}
            {event.durationMs !== null ? ` · ${event.durationMs} ms` : ""}
            {event.candidateCount > 1 ? ` · ${event.candidateCount} could have run` : ""}
          </p>
        </div>
      ) : null}
      {inside && kids.length ? <StepList items={kids} children={children} depth={depth + 1} /> : null}
    </li>
  );
}

/** Which way of doing it ran: its pattern and where it applies; its body only when asked for. */
function Chose({ realization }: { realization: Expr }) {
  const arg = (n: string) => (realization && typeof realization === "object" && "head" in realization ? realization.args.find((a) => a.name === n)?.value : undefined);
  const pattern = arg("pattern") ?? (realization && typeof realization === "object" && "head" in realization ? realization.args[0]?.value : undefined);
  const context = arg("context");
  const body = arg("body");
  return (
    <section className="field">
      <h3>Chose</h3>
      <div className="mono">
        {pattern !== undefined ? formatExpression(pattern) : formatExpression(realization)}
        {context !== undefined ? <span className="faint">{`\nin ${formatExpression(context)}`}</span> : null}
      </div>
      {body !== undefined ? (
        <details className="body">
          <summary>How it is done</summary>
          <div className="mono">{pretty(body)}</div>
        </details>
      ) : null}
    </section>
  );
}

function Field({ label, body, mono = true }: { label: string; body: string; mono?: boolean }) {
  return (
    <section className="field">
      <h3>{label}</h3>
      <div className={mono ? "mono" : "plain"}>{body}</div>
    </section>
  );
}

/** The full-page sheet: a stack of pages, the first a turn's timeline. */
function Sheet({ stack, setStack }: { stack: Page[]; setStack: (s: Page[]) => void }) {
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    if (stack.length) requestAnimationFrame(() => setShown(true));
    else setShown(false);
  }, [stack.length > 0]);
  if (!stack.length) return null;
  const page = stack[stack.length - 1]!;
  const close = () => {
    setShown(false);
    window.setTimeout(() => setStack([]), 220);
  };
  const back = () => setStack(stack.slice(0, -1));
  const open = (p: Page) => setStack([...stack, p]);
  const title = page.kind === "turn" ? "How it answered" : page.kind === "steps" ? "Steps" : page.title;
  return (
    <div className={`sheet-scrim ${shown ? "shown" : ""}`} onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <header className="sheet-head">
          <button type="button" className="round" onClick={stack.length > 1 ? back : close} aria-label={stack.length > 1 ? "Back" : "Close"}>
            {stack.length > 1 ? Icon.back : Icon.close}
          </button>
          <h2>{title}</h2>
          <span className="round ghost" />
        </header>
        <div className="sheet-body" key={stack.length}>
          {page.kind === "turn" ? (
            <>
              <p className="sheet-said">“{page.turn.said}”</p>
              <Timeline rows={rowsOf(page.turn)} onOpen={open} />
            </>
          ) : page.kind === "steps" ? (
            <Steps events={page.turn.detail.events} />
          ) : (
            page.sections.map((s, i) => <Field key={i} label={s.label} body={s.body} mono={s.mono ?? false} />)
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A turn, written out whole for whoever is improving Napkin: what was said and in what
 * conversation, how it was heard and why, what was looked up, what was left undone, every step
 * that ran (as a tree: what it was called with, which realization it chose, what it gave), and
 * what was answered. Long-press a reply (or right-click it) to copy it.
 * ------------------------------------------------------------------ */

function report(t: Turn, before: Turn[], conversation: string | undefined): string {
  const d = t.detail;
  const out: string[] = [];
  const line = (s = "") => out.push(s);
  const block = (label: string, body: string | undefined) => {
    if (!body) return;
    line(`### ${label}`);
    line("```");
    line(body);
    line("```");
    line();
  };
  line(`## Napkin turn report`);
  line();
  line(`- runtime: ${RUNTIME_BUILD}`);
  line(`- host: ${import.meta.env.VITE_NAPKIN_HOST === "browser" ? "browser (GitHub Pages)" : "studio server"}`);
  line(`- conversation: ${conversation ?? "(none)"}`);
  line(`- when: ${new Date().toISOString()}`);
  if (d.ms !== undefined) line(`- took: ${d.ms} ms`);
  line(`- hearing: ${d.stored ? "(reloaded turn: only what was stored)" : d.hearing ?? "unknown"}`);
  line();
  line(`### What I expected`);
  line(`(write what the answer should have been)`);
  line();
  if (before.length) {
    line(`### Conversation before (last ${before.length})`);
    for (const b of before) {
      line(`> ${b.said.replace(/\n/g, "\n> ")}`);
      line(`< ${(b.reply ?? b.failed ?? "").replace(/\n/g, "\n< ")}`);
    }
    line();
  }
  block("Said", t.said);
  block("Replied", t.failed ? `(failed) ${t.failed}` : t.reply);
  block("Heard", d.heard ? pretty(d.heard, 100) : undefined);
  block("What ran", d.meaning && d.meaning !== d.heard ? pretty(d.meaning, 100) : undefined);
  block("Result", d.result ? pretty(d.result, 100) : undefined);
  if (d.why.length) {
    line(`### Why it was read so`);
    for (const w of d.why) line(`- ${w}`);
    line();
  }
  const listed = (label: string, items: string[]) => {
    if (!items.length) return;
    line(`### ${label}`);
    for (const i of items) line(`- ${i}`);
    line();
  };
  listed("Where the answer came from", d.from);
  listed("Pointing words resolved", d.resolved.map((r) => `"${r.reference}" -> ${r.to}`));
  listed("Learned", d.learned.map((l) => `${l.identity} (${l.how})${l.detail ? `: ${l.detail}` : ""}`));
  listed("Left undone", d.gaps.map((g) => `${g.identity} [${g.kind}]: ${g.expression}`));
  listed("Problems", d.problems);
  listed("Lines not read", d.rejected.map((r) => `${r.line}: ${r.reason}`));
  listed("Sources", t.sources.map((s) => `${s.label}: ${s.url}`));
  if (d.events.length) {
    line(`### Steps (${d.events.length})`);
    line("```");
    const ids = new Set(d.events.map((e) => e.id));
    const kids = new Map<string | null, TraceEvent[]>();
    for (const e of d.events) {
      const p = e.parentEventId && ids.has(e.parentEventId) ? e.parentEventId : null;
      kids.set(p, [...(kids.get(p) ?? []), e]);
    }
    const chose = (r: Expr | null) => {
      if (!r || typeof r !== "object" || !("head" in r)) return "";
      const arg = (n: string) => r.args.find((a) => a.name === n)?.value;
      const pattern = arg("pattern") ?? r.args[0]?.value;
      const context = arg("context");
      return ` via ${pattern === undefined ? "?" : formatExpression(pattern)}${context === undefined ? "" : ` in ${formatExpression(context)}`}`;
    };
    const walk = (parent: string | null, depth: number) => {
      for (const e of kids.get(parent) ?? []) {
        const gave = e.output === null ? `ERROR ${e.error ?? ""}` : formatExpression(e.output);
        const extra = [e.outcome, e.durationMs === null ? "" : `${e.durationMs}ms`, e.candidateCount > 1 ? `${e.candidateCount} candidates` : ""].filter(Boolean).join(", ");
        line(`${"  ".repeat(depth)}${formatExpression(e.input)} [${formatExpression(e.useContext)}]${chose(e.selectedRealization)}`);
        line(`${"  ".repeat(depth)}  => ${gave}  (${extra})`);
        walk(e.id, depth + 1);
      }
    };
    walk(null, 0);
    line("```");
  } else if (d.stored) {
    line(`(Steps and reasons are kept only for turns seen live: send the message again to capture them.)`);
  }
  return out.join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard API (an insecure page, an old browser): the selection way.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Long-press (touch) or right-click (mouse): `onPress` with where it happened. */
function usePress(onPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        navigator.vibrate?.(12);
        onPress();
      }, 480);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      onPress();
    },
  };
}

/** What a long-press offers: the reply, or everything about the turn. */
function Actions({ turn, onCopy, onClose, onOpen }: { turn: Turn | undefined; onCopy: (what: "reply" | "report") => void; onClose: () => void; onOpen: () => void }) {
  if (!turn) return null;
  return (
    <div className="actions-scrim" onClick={onClose}>
      <div className="actions" role="menu" onClick={(e) => e.stopPropagation()}>
        <p className="actions-said">{short(turn.reply ?? turn.failed ?? "", 120)}</p>
        <button type="button" role="menuitem" onClick={() => onCopy("report")}>
          {Icon.steps}
          <span>
            Copy everything
            <small>Said, heard, why, steps, answer: all of it, to improve Napkin</small>
          </span>
        </button>
        <button type="button" role="menuitem" onClick={() => onCopy("reply")}>
          {Icon.answer}
          <span>Copy reply</span>
        </button>
        <button type="button" role="menuitem" onClick={onOpen}>
          {Icon.ear}
          <span>How it answered</span>
        </button>
      </div>
    </div>
  );
}

function Reply({ turn, onPress }: { turn: Turn; onPress: () => void }) {
  const press = usePress(onPress);
  return (
    <div className="napkin" {...press}>
      {turn.failed ? <p className="failed-text">{turn.failed}</p> : <Rich text={turn.reply ?? ""} />}
      {turn.sources.length ? (
        <div className="sources">
          {turn.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The app.
 * ------------------------------------------------------------------ */

const SUGGESTIONS = ["what is 12 times 7", "my mom is sick", "who directed jaws", "why is the sky blue?", "explain `[3,1,2].sort()`"];

function App() {
  const [conversations, setConversations] = useState<Summary[]>([]);
  const [current, setCurrent] = useState<string | undefined>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [filter, setFilter] = useState("");
  const [stack, setStack] = useState<Page[]>([]);
  const [toast, setToast] = useState("");
  const [pressed, setPressed] = useState<string | undefined>();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void refresh(true);
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);
  // The composer grows with what is typed, to a point.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);
  // The open turn's page follows the turn as it finishes.
  useEffect(() => {
    if (!stack.length || stack[0]!.kind !== "turn") return;
    const fresh = turns.find((t) => t.id === (stack[0] as { turn: Turn }).turn.id);
    if (fresh && fresh !== (stack[0] as { turn: Turn }).turn) setStack([{ kind: "turn", turn: fresh }, ...stack.slice(1)]);
  }, [turns]);

  async function refresh(openLatest = false) {
    try {
      const data = await api<{ conversations: Summary[] }>("/api/conversations");
      setConversations(data.conversations);
      if (openLatest && data.conversations[0]) await open(data.conversations[0].id);
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function open(id: string) {
    try {
      const data = await api<{ unit: { turns?: Stored[] } }>(`/api/conversations/${encodeURIComponent(id)}`);
      setCurrent(id);
      setTurns((live) =>
        (data.unit.turns ?? []).map((s, i) => {
          // A turn just watched keeps what was seen of it; a stored one has only what it kept.
          const seen = live.find((t) => t.said === s.message && !t.detail.stored && t.id.startsWith(`${id}:`) && t.id.endsWith(`:${i}`));
          return (
            seen ?? {
              id: `${id}:${i}`,
              said: s.message,
              reply: s.spoken?.trim() || s.result,
              sources: s.sources ?? [],
              pending: false,
              detail: { ...empty(), meaning: s.parsed, result: s.result, stored: true },
            }
          );
        }),
      );
      setDrawer(false);
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function startNew(): Promise<string> {
    const data = await api<{ conversation: Summary }>("/api/conversations", { method: "POST", body: JSON.stringify({ persistent: true }) });
    setCurrent(data.conversation.id);
    setTurns([]);
    setConversations((c) => [data.conversation, ...c]);
    return data.conversation.id;
  }

  async function send(text = draft) {
    const said = text.trim();
    if (!said || sending) return;
    setSending(true);
    setDraft("");
    let id = current;
    try {
      id ??= await startNew();
    } catch (e) {
      setSending(false);
      setToast(e instanceof Error ? e.message : String(e));
      return;
    }
    const turnId = `${id}:${turns.length}`;
    const began = performance.now();
    setTurns((ts) => [...ts, { id: turnId, said, sources: [], pending: true, detail: empty() }]);
    const update = (f: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === turnId ? f(t) : t)));
    try {
      const response = await request("/api/chat/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: id, text: said }) });
      if (!response.ok || !response.body) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || response.statusText);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (frame: string) => {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) return;
        const ev = JSON.parse(line.slice(6)) as Record<string, unknown>;
        const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
        if (ev.type === "meaning" && typeof ev.expression === "string") update((t) => ({ ...t, detail: { ...t.detail, meaning: ev.expression as string } }));
        else if (ev.type === "complete") {
          update((t) => ({
            ...t,
            pending: false,
            reply: String(ev.message ?? ""),
            sources: list<Source>(ev.sources),
            detail: {
              ...t.detail,
              heard: typeof ev.heard === "string" ? ev.heard : undefined,
              result: typeof ev.result === "string" ? ev.result : undefined,
              hearing: typeof ev.hearing === "string" ? ev.hearing : undefined,
              why: list<string>(ev.why),
              from: list<string>(ev.from),
              resolved: list(ev.resolved),
              learned: list(ev.learned),
              gaps: list(ev.gaps),
              problems: list<string>(ev.problems),
              rejected: list(ev.rejected),
              events: list<TraceEvent>(ev.events),
              ms: Math.round(performance.now() - began),
            },
          }));
          const summary = ev.conversation as Summary | undefined;
          if (summary) setConversations((c) => [summary, ...c.filter((x) => x.id !== summary.id)]);
        } else if (ev.type === "error") {
          update((t) => ({ ...t, pending: false, failed: String(ev.message ?? ev.error ?? "The turn failed") }));
        }
      };
      for (;;) {
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        frames.forEach(consume);
        if (part.done) {
          if (buffer.trim()) consume(buffer);
          break;
        }
      }
    } catch (e) {
      update((t) => ({ ...t, pending: false, failed: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  const shown = conversations.filter((c) => !filter || (c.lastMessage ?? "").toLowerCase().includes(filter.toLowerCase()));
  const title = conversations.find((c) => c.id === current)?.lastMessage;

  return (
    <div className="app">
      <header className="top">
        <button type="button" className="round" onClick={() => setDrawer(true)} aria-label="Conversations">
          {Icon.menu}
        </button>
        <span className="top-title">{turns.length ? short(title ?? turns[0]?.said, 32) : ""}</span>
        <button type="button" className="round" onClick={() => void startNew().catch((e) => setToast(String(e)))} aria-label="New chat">
          {Icon.compose}
        </button>
      </header>

      <main className="scroll" ref={scroller}>
        {turns.length === 0 ? (
          <div className="hello">
            <div className="mark">✳</div>
            <h1>What's on your mind?</h1>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button type="button" key={s} onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread">
            {turns.map((t) => (
              <article key={t.id} className="turn">
                <div className="you">
                  <Rich text={t.said} />
                </div>
                <button type="button" className={`activity ${t.pending ? "pending" : ""} ${t.failed ? "failed" : ""}`} onClick={() => setStack([{ kind: "turn", turn: t }])}>
                  {t.pending ? <Dots /> : <span className="activity-icon">{t.failed ? Icon.warn : Icon.steps}</span>}
                  <span className="activity-text">{summaryLine(t)}</span>
                  {t.pending ? null : <span className="activity-chevron">{Icon.chevron}</span>}
                </button>
                {t.reply !== undefined || t.failed ? <Reply turn={t} onPress={() => setPressed(t.id)} /> : null}
              </article>
            ))}
          </div>
        )}
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={draft}
          placeholder="Reply to Napkin"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-row">
          <button type="button" className="round small" aria-label="Add code" onClick={() => setDraft((d) => `${d}${d ? "\n" : ""}\`\`\`\n\n\`\`\``)}>
            {Icon.plus}
          </button>
          <span className="composer-hint">Napkin · concepts, no LLM</span>
          <button type="submit" className={`send ${draft.trim() && !sending ? "ready" : ""}`} disabled={!draft.trim() || sending} aria-label="Send">
            {sending ? <Dots /> : Icon.up}
          </button>
        </div>
      </form>

      <div className={`drawer-scrim ${drawer ? "shown" : ""}`} onClick={() => setDrawer(false)} />
      <nav className={`drawer ${drawer ? "shown" : ""}`} aria-hidden={!drawer}>
        <div className="drawer-head">
          <h1>Napkin</h1>
        </div>
        <label className="search">
          {Icon.search}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" />
        </label>
        <a className="drawer-link" href="./">
          {Icon.studio}
          <span>Studio</span>
        </a>
        <h2>Recents</h2>
        <ul className="recents">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className={c.id === current ? "current" : ""} onClick={() => void open(c.id)}>
                <span>{c.lastMessage?.trim() || "New conversation"}</span>
                <small>{c.turns}</small>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="new"
          onClick={() => {
            setDrawer(false);
            void startNew().catch((e) => setToast(String(e)));
          }}
        >
          {Icon.plus}
          New chat
        </button>
      </nav>

      <Actions
        turn={turns.find((t) => t.id === pressed)}
        onClose={() => setPressed(undefined)}
        onOpen={() => {
          const t = turns.find((x) => x.id === pressed);
          setPressed(undefined);
          if (t) setStack([{ kind: "turn", turn: t }]);
        }}
        onCopy={(what) => {
          const at = turns.findIndex((x) => x.id === pressed);
          const t = turns[at];
          setPressed(undefined);
          if (!t) return;
          const text = what === "reply" ? t.reply ?? t.failed ?? "" : report(t, turns.slice(Math.max(0, at - 4), at), current);
          void copyText(text).then((ok) => setToast(ok ? (what === "reply" ? "Reply copied" : `Copied everything (${text.length.toLocaleString()} characters)`) : "Couldn't copy"));
        }}
      />
      <Sheet stack={stack} setStack={setStack} />
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
