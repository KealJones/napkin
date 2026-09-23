import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  application,
  formatExpression,
  isExpr,
  parseExpression,
  type Expr,
} from "@napkin/concept-runtime/expression";
import type { TraceEvent } from "@napkin/concept-runtime";
import "./styles.css";
import { EarsLab } from "./EarsLab";

type Page = "chat" | "concepts" | "traces" | "ears";
type ConversationSummary = {
  id: string;
  persistent: boolean;
  startedAt: string;
  turns: number;
  lastMessage?: string;
};
type RealizationView = {
  pattern: string;
  context: string;
  body: string;
  properties: string[];
  retired: boolean;
};
type ConceptUnit = {
  identity: string;
  /** Authored here. */
  relations: string[];
  /** Queried through the index — a symmetric relation appears on the end that does not hold it. */
  derived: string[];
  cluster: { identity: string; via: string }[];
  realizations: RealizationView[];
  realizable: boolean;
  updatedAt?: string;
  usage?: { selected: number; residual: number };
};
type Reader = "model" | "rules" | "hybrid";

type Activity = {
  id: string;
  meaning: string | null;
  result: string | null;
  teacherUsed: boolean;
  teacherLesson: string | null;
  teacherResponse: string | null;
  teacherStatus: string;
  complete: boolean;
  failed: boolean;
  expanded: boolean;
  /** What the parser emitted, before lifting. */
  heard: string | null;
  /** Who read the message, and why the rules handed it to the model if they did. */
  reader?: string | null;
  fallback?: string | null;
  /** References the parser marked, and what memory resolved them to. */
  resolved: { reference: string; to: string }[];
  /** What the graph could not realize — the learning queue. */
  gaps: { kind: string; identity: string; expression: string }[];
  /** How each gap was closed. */
  learned: { how: string; identity: string; detail: string }[];
  /** Checks the parse failed, and lines the parser could not read. */
  problems: string[];
  rejected: { line: string; reason: string }[];
  events: TraceEvent[];
};
type ChatMessage = {
  role: "User" | "Assistant";
  content: string;
  result?: Expr | null;
  activity?: Activity;
};
type ConversationUnit = {
  identity: string;
  relations: string[];
  turns: {
    at: string;
    message: string;
    parsed: string;
    result: string;
    spoken?: string;
  }[];
};
type TraceSummary = {
  traceId: string;
  startedAt: string;
  endedAt: string | null;
  eventCount: number;
};

const initialPrompt = "";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload;
}

function argsOf(expression: Expr | undefined, name: string): Expr | undefined {
  if (!expression || typeof expression !== "object" || !("head" in expression))
    return undefined;
  return expression.args.find((argument) => argument.name === name)?.value;
}

function headOf(expression: Expr | undefined): string {
  return expression && typeof expression === "object" && "head" in expression
    ? expression.head
    : "";
}

function prettyExpression(expression: Expr, depth = 0): string {
  if (expression === null || typeof expression !== "object")
    return formatExpression(expression);
  if ("variable" in expression) return formatExpression(expression);
  const args = expression.args.map((argument) => {
    const value = prettyExpression(argument.value, depth + 1);
    return argument.name === undefined ? value : `${argument.name}=${value}`;
  });
  const flat = `${expression.head}(${args.join(", ")})`;
  if (flat.length < 86 && !flat.includes("\n")) return flat;
  if (args.length === 0) return `${expression.head}()`;
  const indent = "  ".repeat(depth);
  return `${expression.head}(\n${args
    .map((argument) => "  ".repeat(depth + 1) + argument)
    .join(",\n")}\n${indent})`;
}

function prettyExpressionText(source: string): string {
  try {
    return prettyExpression(parseExpression(source));
  } catch {
    return source;
  }
}

function Highlight({ value }: { value: string }) {
  const token =
    /"(?:\\.|[^"\\])*"|\$[A-Za-z_][A-Za-z0-9_.-]*|[A-Z][A-Za-z0-9_.-]*(?=\()|\b\d+(?:\.\d+)?\b|[(),=]/g;
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of value.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > offset) parts.push(value.slice(offset, index));
    const word = match[0];
    const className = word.startsWith('"')
      ? "tok-string"
      : word.startsWith("$")
        ? "tok-variable"
        : /^[A-Z]/.test(word) &&
            value
              .slice(index + word.length)
              .trimStart()
              .startsWith("(")
          ? "tok-concept"
          : /^\d/.test(word)
            ? "tok-number"
            : "tok-punctuation";
    parts.push(
      <span className={className} key={`${index}-${word}`}>
        {word}
      </span>,
    );
    offset = index + word.length;
  }
  if (offset < value.length) parts.push(value.slice(offset));
  return <code>{parts}</code>;
}

function expressionOf(source: string): Expr {
  return parseExpression(source);
}

function expressionOrNull(source: string): Expr | null {
  if (!source.trim()) return null;
  try {
    return expressionOf(source);
  } catch {
    return null;
  }
}

function conversationTitle(summary: ConversationSummary): string {
  return summary.lastMessage?.trim() || "New conversation";
}

function activityFromConversation(unit: ConversationUnit): ChatMessage[] {
  if (unit.turns?.length) {
    return unit.turns.flatMap((turn, index) => {
      const result = turn.result.trim();
      const activity: Activity = {
        id: `history-${index + 1}`,
        meaning: turn.parsed.trim() || null,
        result: result || null,
        teacherUsed: false,
        teacherLesson: null,
        teacherResponse: null,
        teacherStatus: "not used",
        complete: true,
        failed: false,
        expanded: false,
        heard: null,
        resolved: [],
        gaps: [],
        learned: [],
        problems: [],
        rejected: [],
        events: [],
      };
      return [
        { role: "User", content: turn.message, activity },
        {
          role: "Assistant",
          content: turn.spoken?.trim() || result || "(no response)",
          result: expressionOrNull(result),
        },
      ];
    });
  }

  // Keep reading older graph data that used the pre-HasTurn conversation shape.
  const messages: ChatMessage[] = [];
  let latestUser: ChatMessage | undefined;
  for (const relation of unit.relations ?? []) {
    const head = headOf(relation);
    if (head === "Message") {
      const role = headOf(argsOf(relation, "role"));
      const content = argsOf(relation, "content");
      if (
        (role === "User" || role === "Assistant") &&
        typeof content === "string"
      ) {
        const message: ChatMessage = {
          role,
          content,
          result: argsOf(relation, "result") ?? null,
        };
        messages.push(message);
        if (role === "User") {
          latestUser = message;
          latestUser.activity = {
            id: `history-${messages.length}`,
            meaning: null,
            result: null,
            teacherUsed: false,
            teacherLesson: null,
            teacherResponse: null,
            teacherStatus: "not used",
            complete: true,
            failed: false,
            expanded: false,
            heard: null,
            resolved: [],
            gaps: [],
            learned: [],
            problems: [],
            rejected: [],
            events: [],
          };
        } else if (latestUser?.activity) {
          latestUser.activity.result = message.result
            ? formatExpression(message.result)
            : null;
        }
      }
    } else if (head === "InterpretedAs" && latestUser?.activity) {
      latestUser.activity.meaning =
        typeof relation === "string" ? relation : null;
    } else if (head === "TeacherUsage" && latestUser?.activity) {
      latestUser.activity.teacherUsed = argsOf(relation, "used") === true;
      const lesson = argsOf(relation, "lesson");
      const response = argsOf(relation, "response");
      latestUser.activity.teacherLesson = lesson
        ? formatExpression(lesson)
        : null;
      latestUser.activity.teacherResponse = response
        ? formatExpression(response)
        : null;
      latestUser.activity.teacherStatus = latestUser.activity.teacherUsed
        ? latestUser.activity.teacherLesson
          ? "learned and saved"
          : "used"
        : "not used";
    }
  }
  return messages;
}

function App() {
  const [page, setPage] = useState<Page>("chat");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [newPersistent, setNewPersistent] = useState(true);
  const [persistentTurn, setPersistentTurn] = useState(true);
  const [model, setModel] = useState("qwen3.5:4b");
  // Who reads a message: the rules first and the model for what they cannot (hybrid), or one alone.
  const [readBy, setReadBy] = useState<Reader>(() => {
    try {
      const saved = localStorage.getItem("napkin-reader");
      return saved === "model" || saved === "rules" || saved === "hybrid" ? saved : "hybrid";
    } catch {
      return "hybrid";
    }
  });
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:11434");
  const [title, setTitle] = useState("New conversation");
  const [concepts, setConcepts] = useState<ConceptUnit[]>([]);
  const [conceptCount, setConceptCount] = useState(0);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [hideMemory, setHideMemory] = useState(() => {
    try {
      return (
        localStorage.getItem("napkin-hide-conversation-memory") !== "false"
      );
    } catch {
      return true;
    }
  });
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const activeActivityRef = useRef<string | null>(null);

  const currentConversation = conversations.find(
    (item) => item.id === conversationId,
  );
  const visibleConcepts = useMemo(
    () =>
      concepts.filter(
        (item) =>
          !hideMemory ||
          !/^(Conversation_|IsolatedConversation_)/.test(item.identity),
      ),
    [concepts, hideMemory],
  );

  useEffect(() => {
    void refreshConversations();
    void loadConcepts("");
  }, []);

  useEffect(() => {
    if (page === "concepts") void loadConcepts(search);
  }, [search, hideMemory, page]);

  useEffect(() => {
    if (page === "traces") void refreshTraces();
  }, [page]);

  useEffect(() => {
    if (
      visibleConcepts.length &&
      !visibleConcepts.some((unit) => unit.identity === selectedConcept)
    ) {
      setSelectedConcept(visibleConcepts[0]?.identity ?? null);
    }
  }, [visibleConcepts, selectedConcept]);

  useEffect(() => {
    if (messagesRef.current)
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshConversations(selectId?: string) {
    try {
      const data = await api<{ conversations: ConversationSummary[] }>(
        "/api/conversations",
      );
      setConversations(data.conversations);
      if (selectId) await openConversation(selectId, data.conversations);
      else if (!conversationId && data.conversations.length) {
        await openConversation(data.conversations[0]!.id, data.conversations);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function openConversation(id: string, summaries = conversations) {
    try {
      const data = await api<{
        unit: ConversationUnit;
        summary: ConversationSummary;
      }>(`/api/conversations/${encodeURIComponent(id)}`);
      setConversationId(id);
      setMessages(activityFromConversation(data.unit));
      setTitle(
        data.summary ? conversationTitle(data.summary) : data.unit.identity,
      );
      setPersistentTurn(data.summary?.persistent ?? true);
      setNewPersistent(data.summary?.persistent ?? true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
    if (summaries.length) setConversations(summaries);
  }

  async function createConversation(persistent: boolean): Promise<string> {
    const data = await api<{ conversation: ConversationSummary }>(
      "/api/conversations",
      {
        method: "POST",
        body: JSON.stringify({ persistent }),
      },
    );
    setConversationId(data.conversation.id);
    setMessages([]);
    setTitle(conversationTitle(data.conversation));
    setPersistentTurn(persistent);
    setNewPersistent(persistent);
    await refreshConversations(data.conversation.id);
    return data.conversation.id;
  }

  async function loadConcepts(query: string) {
    try {
      const data = await api<{
        concepts: ConceptUnit[];
        total: number;
        graph: { size: number; path: string };
      }>(
        `/api/concepts?limit=500${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      );
      setConcepts(data.concepts);
      // The graph size, not the size of this page of results.
      setConceptCount(data.graph?.size ?? data.total);
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshTraces(preferredTraceId?: string) {
    setTracesLoading(true);
    try {
      const data = await api<{ traces: TraceSummary[] }>("/api/traces");
      setTraces(data.traces);
      const nextId =
        preferredTraceId ??
        (selectedTraceId &&
        data.traces.some((trace) => trace.traceId === selectedTraceId)
          ? selectedTraceId
          : data.traces[0]?.traceId);
      if (nextId) await openTrace(nextId);
      else {
        setSelectedTraceId(null);
        setTraceEvents([]);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    } finally {
      setTracesLoading(false);
    }
  }

  async function openTrace(traceId: string) {
    setSelectedTraceId(traceId);
    try {
      const data = await api<{ traceId: string; events: TraceEvent[] }>(
        `/api/traces/${encodeURIComponent(traceId)}`,
      );
      setTraceEvents(data.events);
    } catch (error) {
      setTraceEvents([]);
      setToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function closeIsolatedConversation() {
    if (!conversationId?.startsWith("IsolatedConversation_")) return;
    try {
      await api(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
      });
      setConversationId(null);
      setMessages([]);
      await refreshConversations();
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyConversationId() {
    if (!conversationId) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(conversationId);
      } else {
        const input = document.createElement("textarea");
        input.value = conversationId;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Clipboard access is unavailable");
      }
      setToast("Conversation ID copied.");
    } catch {
      setToast("Could not copy the conversation ID.");
    }
  }

  function updateActivity(
    id: string,
    update: (activity: Activity) => Activity,
  ) {
    setMessages((previous) =>
      previous.map((message) =>
        message.activity?.id === id
          ? { ...message, activity: update(message.activity) }
          : message,
      ),
    );
  }

  async function sendPrompt() {
    const source = prompt.trim();
    if (!source || sending) return;
    setSending(true);
    try {
      let id = conversationId;
      if (!id || currentConversation?.persistent !== persistentTurn) {
        id = await createConversation(persistentTurn);
      }
      const activityId = `turn-${Date.now()}`;
      activeActivityRef.current = activityId;
      const activity: Activity = {
        id: activityId,
        meaning: null,
        result: null,
        teacherUsed: false,
        teacherLesson: null,
        teacherResponse: null,
        teacherStatus: "not used",
        complete: false,
        failed: false,
        expanded: true,
        heard: null,
        resolved: [],
        gaps: [],
        learned: [],
        problems: [],
        rejected: [],
        events: [],
      };
      setMessages((previous) => [
        ...previous,
        { role: "User", content: source, activity },
      ]);
      setPrompt("");
      const response = await fetch("/api/chat/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          text: source,
          model,
          endpoint,
          backend: readBy,
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          data.error || response.statusText || "Could not start the chat turn",
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (frame: string) => {
        const line = frame
          .split("\n")
          .find((part) => part.startsWith("data: "));
        if (!line) return;
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (event.type === "meaning" && typeof event.expression === "string") {
          updateActivity(activityId, (item) => ({
            ...item,
            meaning: event.expression as string,
            reader: typeof event.reader === "string" ? event.reader : null,
            fallback: typeof event.fallback === "string" ? event.fallback : null,
          }));
        } else if (event.type === "teacher") {
          updateActivity(activityId, (item) => ({
            ...item,
            teacherUsed: event.used === true,
            teacherStatus:
              event.status === "learned"
                ? "learned and saved"
                : event.status === "failure"
                  ? "call failed"
                  : "called",
            teacherLesson:
              typeof event.lesson === "string"
                ? event.lesson
                : item.teacherLesson,
            teacherResponse:
              typeof event.response === "string"
                ? event.response
                : item.teacherResponse,
          }));
        } else if (event.type === "complete") {
          updateActivity(activityId, (item) => ({
            ...item,
            complete: true,
            teacherUsed: event.teacherUsed === true,
            teacherLesson:
              typeof event.teacherLesson === "string"
                ? event.teacherLesson
                : item.teacherLesson,
            teacherResponse:
              typeof event.teacherResponse === "string"
                ? event.teacherResponse
                : item.teacherResponse,
            result:
              typeof event.result === "string" ? event.result : item.result,
            teacherStatus: event.teacherUsed
              ? event.teacherLesson
                ? "learned and saved"
                : "used"
              : "not used",
            heard: typeof event.heard === "string" ? event.heard : item.heard,
            reader: typeof event.reader === "string" ? event.reader : item.reader ?? null,
            fallback: typeof event.fallback === "string" ? event.fallback : item.fallback ?? null,
            resolved: Array.isArray(event.resolved)
              ? (event.resolved as Activity["resolved"])
              : item.resolved,
            gaps: Array.isArray(event.gaps)
              ? (event.gaps as Activity["gaps"])
              : item.gaps,
            learned: Array.isArray(event.learned)
              ? (event.learned as Activity["learned"])
              : item.learned,
            problems: Array.isArray(event.problems)
              ? (event.problems as string[])
              : item.problems,
            rejected: Array.isArray(event.rejected)
              ? (event.rejected as Activity["rejected"])
              : item.rejected,
            events: Array.isArray(event.events)
              ? (event.events as TraceEvent[])
              : item.events,
          }));
          setMessages((previous) => [
            ...previous,
            {
              role: "Assistant",
              content: String(event.message ?? ""),
              result:
                typeof event.result === "string"
                  ? expressionOf(event.result)
                  : null,
            },
          ]);
          const summary = event.conversation as ConversationSummary | undefined;
          if (summary) {
            setTitle(conversationTitle(summary));
            setConversations((previous) => [
              summary,
              ...previous.filter((item) => item.id !== summary.id),
            ]);
          }
          activeActivityRef.current = null;
        } else if (event.type === "error") {
          updateActivity(activityId, (item) => ({
            ...item,
            complete: true,
            failed: true,
          }));
          setToast(String(event.error ?? "The chat turn failed"));
          activeActivityRef.current = null;
        }
      };
      while (true) {
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
      await refreshConversations();
    } catch (error) {
      const activeId = activeActivityRef.current;
      if (activeId)
        updateActivity(activeId, (item) => ({
          ...item,
          complete: true,
          failed: true,
        }));
      setToast(error instanceof Error ? error.message : String(error));
    } finally {
      activeActivityRef.current = null;
      setSending(false);
    }
  }

  async function saveConcept(
    unit: ConceptUnit,
    relations: string,
    realizations: string,
  ): Promise<boolean> {
    try {
      // Relations and realizations are written as Concept expressions, one per line,
      // because that is the language — not as JSON.
      const payload = {
        identity: unit.identity,
        relations: relations
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        realizations: JSON.parse(realizations) as unknown[],
      };
      await api(`/api/concepts/${encodeURIComponent(unit.identity)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setToast("Concept saved to the live graph.");
      await loadConcepts(search);
      return true;
    } catch (error) {
      setToast(
        `Could not save Concept: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async function selectLinkedConcept(identity: string) {
    try {
      const data = await api<{
        concept: ConceptUnit;
        usage: ConceptUnit["usage"];
      }>(`/api/concepts/${encodeURIComponent(identity)}`);
      setSelectedConcept(identity);
      setConcepts((previous) => [
        data.concept,
        ...previous.filter((item) => item.identity !== identity),
      ]);
    } catch {
      setToast(`No stored Concept named ${identity}`);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">C</div>
          <span className="brand-name">
            napkin <span className="brand-accent">studio</span>
          </span>
        </div>
        <div>
          <div className="side-label">Workspace</div>
          <nav className="nav">
            <button
              className={page === "chat" ? "active" : ""}
              onClick={() => setPage("chat")}
            >
              <span>◉</span>
              <b className="nav-label">Chat</b>
            </button>
            <button
              className={page === "concepts" ? "active" : ""}
              onClick={() => setPage("concepts")}
            >
              <span>◇</span>
              <b className="nav-label">Concepts</b>
            </button>
            <button
              className={page === "traces" ? "active" : ""}
              onClick={() => setPage("traces")}
            >
              <span>⌁</span>
              <b className="nav-label">Trace history</b>
            </button>
            <button
              className={page === "ears" ? "active" : ""}
              onClick={() => setPage("ears")}
            >
              <span>◎</span>
              <b className="nav-label">Ears lab</b>
            </button>
          </nav>
        </div>
        <div className="side-bottom">
          <span className="runtime-dot" />
          Local runtime
          <br />
          <span className="side-indent">Concept graph · Ollama</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h1>
            {page === "chat"
              ? "Chat"
              : page === "concepts"
                ? "Concept network"
                : page === "ears"
                  ? "Ears lab"
                  : "Trace history"}
          </h1>
          <div className="topmeta">
            <span>
              {page === "traces"
                ? `${traces.length} traces`
                : `${conceptCount} Concepts`}
            </span>
            <span className="badge">LOCAL</span>
          </div>
        </header>
        {page === "ears" ? (
          <EarsLab />
        ) : page === "chat" ? (
          <section className="page active">
            <div className="chat-layout">
              <aside className="conversation-list">
                <div className="list-head">
                  <strong>Conversations</strong>
                  <button
                    className="ghost"
                    title="New conversation"
                    onClick={() =>
                      void createConversation(newPersistent).catch(
                        (error: unknown) => setToast(String(error)),
                      )
                    }
                  >
                    ＋
                  </button>
                </div>
                <label className="persist-toggle sidebar-persist">
                  <input
                    type="checkbox"
                    checked={newPersistent}
                    onChange={(event) => setNewPersistent(event.target.checked)}
                  />{" "}
                  Save conversation memory
                </label>
                {conversations.map((item) => (
                  <button
                    key={item.id}
                    className={`conversation ${item.id === conversationId ? "selected" : ""}`}
                    onClick={() => void openConversation(item.id)}
                  >
                    <span>{conversationTitle(item)}</span>
                    <span className="badge">
                      {item.persistent ? "saved" : "private"}
                    </span>
                  </button>
                ))}
              </aside>
              <div className="chat-main">
                <div className="chat-title">
                  <div>
                    <h2>{title}</h2>
                    <small>
                      {persistentTurn
                        ? "Global memory · saved conversation"
                        : "Isolated conversation · transcript is temporary"}
                    </small>
                    {conversationId && (
                      <div className="conversation-id">
                        <span>Conversation ID</span>
                        <code title={conversationId}>{conversationId}</code>
                        <button
                          className="copy-id"
                          type="button"
                          title="Copy conversation ID"
                          aria-label="Copy conversation ID"
                          onClick={() => void copyConversationId()}
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                  {!persistentTurn && (
                    <button
                      className="ghost"
                      title="Close isolated conversation"
                      onClick={() => void closeIsolatedConversation()}
                    >
                      Close
                    </button>
                  )}
                </div>
                <div className="messages" ref={messagesRef}>
                  {messages.length === 0 ? (
                    <div className="empty-state">
                      <div className="orb">💡</div>
                      <h2>Think in Concepts.</h2>
                      <p>
                        Messages are interpreted into the live Concept network.
                        Each turn shows its parsed meaning and the Concepts it
                        used.
                      </p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        className="message-group"
                        key={`${message.role}-${index}`}
                      >
                        <div
                          className={`message ${message.role === "User" ? "user" : "assistant"}`}
                        >
                          {message.role === "Assistant" && (
                            <div className="role">napkin</div>
                          )}
                          <div className="content">{message.content}</div>
                        </div>
                        {message.role === "User" && message.activity && (
                          <ActivityPanel activity={message.activity} />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="composer-wrap">
                  <div className="composer">
                    <textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendPrompt();
                        }
                      }}
                      placeholder="Ask something…"
                      rows={2}
                    />
                    <div className="composer-actions">
                      <label className="persist-toggle">
                        <input
                          type="checkbox"
                          checked={persistentTurn}
                          onChange={(event) =>
                            setPersistentTurn(event.target.checked)
                          }
                        />{" "}
                        Persist chat
                      </label>
                      <span className="spacer" />
                      <select
                        className="model-input reader-select"
                        value={readBy}
                        title="Who reads the message: the rules, the model, or the rules with the model for what they cannot read"
                        onChange={(event) => {
                          const next = event.target.value as Reader;
                          setReadBy(next);
                          try {
                            localStorage.setItem("napkin-reader", next);
                          } catch {
                            /* storage may be unavailable */
                          }
                        }}
                        aria-label="Reader"
                      >
                        <option value="hybrid">Hybrid</option>
                        <option value="rules">Rules</option>
                        <option value="model">LLM</option>
                      </select>
                      <input
                        className="model-input"
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        aria-label="Ollama model"
                      />
                      <input
                        className="model-input endpoint-input"
                        value={endpoint}
                        onChange={(event) => setEndpoint(event.target.value)}
                        aria-label="Ollama endpoint"
                      />
                      <button
                        className="primary"
                        disabled={sending || !prompt.trim()}
                        onClick={() => void sendPrompt()}
                      >
                        {sending ? "Thinking…" : "Send ↗"}
                      </button>
                    </div>
                  </div>
                  <div className="hint">
                    Enter to send · Shift+Enter for a new line · Global Concept
                    memory is available in both conversation modes
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : page === "concepts" ? (
          <section className="page active">
            <div className="browser-layout">
              <aside className="concept-list">
                <input
                  className="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search Concepts and descriptions…"
                />
                <label className="memory-filter">
                  <input
                    type="checkbox"
                    checked={hideMemory}
                    onChange={(event) => {
                      setHideMemory(event.target.checked);
                      try {
                        localStorage.setItem(
                          "napkin-hide-conversation-memory",
                          String(event.target.checked),
                        );
                      } catch {
                        /* storage may be unavailable */
                      }
                    }}
                  />{" "}
                  Hide conversation memory
                </label>
                <div className="concept-items">
                  {visibleConcepts.map((unit) => (
                    <button
                      className={`concept-item ${unit.identity === selectedConcept ? "selected" : ""}`}
                      key={unit.identity}
                      onClick={() => setSelectedConcept(unit.identity)}
                    >
                      <strong>{unit.identity}</strong>
                      <small>
                        {unit.realizable ? "realizes" : "data"} ·{" "}
                        {unit.relations.length} relations ·{" "}
                        {unit.realizations.length} realizations
                      </small>
                    </button>
                  ))}
                  {visibleConcepts.length === 0 && (
                    <div className="empty-search">
                      No Concepts found. Try a different search.
                    </div>
                  )}
                </div>
              </aside>
              <ConceptEditor
                concept={
                  visibleConcepts.find(
                    (unit) => unit.identity === selectedConcept,
                  ) ?? null
                }
                onSave={saveConcept}
                onSelect={selectLinkedConcept}
              />
            </div>
          </section>
        ) : (
          <section className="page active">
            <div className="trace-page">
              <aside className="trace-list">
                <div className="trace-list-heading">
                  <strong>Recent traces</strong>
                  <button
                    className="ghost"
                    title="Refresh trace history"
                    onClick={() => void refreshTraces()}
                  >
                    ↻
                  </button>
                </div>
                {traces.map((trace) => (
                  <button
                    className={`trace-entry ${trace.traceId === selectedTraceId ? "selected" : ""}`}
                    key={trace.traceId}
                    onClick={() => void openTrace(trace.traceId)}
                  >
                    <strong>
                      {new Date(trace.startedAt).toLocaleString()}
                    </strong>
                    <small>
                      {trace.eventCount} Concept calls · {trace.traceId}
                    </small>
                  </button>
                ))}
                {!tracesLoading && traces.length === 0 && (
                  <div className="empty-search">No trace history yet.</div>
                )}
                {tracesLoading && traces.length === 0 && (
                  <div className="empty-search">Loading trace history…</div>
                )}
              </aside>
              {selectedTraceId ? (
                <TraceDetail traceId={selectedTraceId} events={traceEvents} />
              ) : (
                <article className="trace-detail trace-empty">
                  <div className="empty-state">
                    <div className="orb">⌁</div>
                    <h2>No trace selected</h2>
                    <p>
                      Completed Concept evaluations appear here with their
                      inputs, outputs, realizations, and nested calls.
                    </p>
                  </div>
                </article>
              )}
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ActivityPanel({ activity }: { activity: Activity }) {
  const meaning = activity.meaning
    ? prettyExpressionText(activity.meaning)
    : "";
  const answer = activity.result ? prettyExpressionText(activity.result) : "";
  return (
    <details
      className="turn-activity"
      open={activity.expanded}
      onToggle={(event) => {
        const expanded = event.currentTarget.open;
        if (activity.expanded !== expanded) activity.expanded = expanded;
      }}
    >
      <summary>
        <span className="turn-activity-title">Concept activity</span>
        <span className="turn-activity-meta">
          {activity.failed
            ? "Failed"
            : activity.complete
              ? "Complete"
              : "Running"}
          {activity.teacherUsed ? " · Teacher used" : ""}
        </span>
      </summary>
      <div className="turn-activity-scroll">
        <details className="activity-step" open>
          <summary>
            Input Concept expression
            {activity.reader ? (
              <span className="muted">
                {" "}
                · read by {activity.reader === "rules" ? "rules" : "LLM"}
                {activity.fallback && activity.reader !== "rules" ? ` (rules ${activity.fallback})` : ""}
              </span>
            ) : null}
          </summary>
          <div className="activity-step-body">
            {meaning ? (
              <pre>
                <Highlight value={meaning} />
              </pre>
            ) : (
              <span className="muted">
                Waiting for the input Concept expression…
              </span>
            )}
          </div>
        </details>
        <details className="activity-step">
          <summary>
            Teacher · {activity.teacherUsed ? "used" : "not used"}
          </summary>
          <div className="activity-step-body">
            {activity.teacherUsed ? (
              <>
                <div className="muted">{activity.teacherStatus}</div>
                {activity.teacherLesson && (
                  <>
                    <div className="phase">Learned Concept</div>
                    <pre>
                      <Highlight
                        value={prettyExpressionText(activity.teacherLesson)}
                      />
                    </pre>
                  </>
                )}
                {activity.teacherResponse && (
                  <>
                    <div className="phase">Teacher response</div>
                    <pre>
                      <Highlight
                        value={prettyExpressionText(activity.teacherResponse)}
                      />
                    </pre>
                  </>
                )}
              </>
            ) : (
              "Teacher was not used for this turn."
            )}
          </div>
        </details>
        <details className="activity-step">
          <summary>Answer Concept expression</summary>
          <div className="activity-step-body">
            {answer ? (
              <pre>
                <Highlight value={answer} />
              </pre>
            ) : (
              <span className="muted">
                Waiting for the answer Concept expression…
              </span>
            )}
          </div>
        </details>
        {activity.heard && activity.heard !== activity.meaning && (
          <details className="activity-step">
            <summary>Heard · lines before lifting</summary>
            <div className="activity-step-body">
              <pre>
                <Highlight value={activity.heard} />
              </pre>
            </div>
          </details>
        )}
        {activity.resolved.length > 0 && (
          <details className="activity-step">
            <summary>
              Resolved · {activity.resolved.length} reference
              {activity.resolved.length === 1 ? "" : "s"}
            </summary>
            <div className="activity-step-body">
              {activity.resolved.map((item, index) => (
                <pre key={index}>
                  <Highlight
                    value={`Ref(${JSON.stringify(item.reference)})\n  => ${item.to}`}
                  />
                </pre>
              ))}
              <small className="muted">
                The parser marks a reference; memory resolves it. Pointing is
                not naming.
              </small>
            </div>
          </details>
        )}
        {activity.learned.length > 0 && (
          <details className="activity-step" open>
            <summary>Learned · {activity.learned.length}</summary>
            <div className="activity-step-body">
              {activity.learned.map((item, index) => (
                <pre key={index}>
                  <Highlight
                    value={`${item.how}: ${item.identity}\n  ${item.detail}`}
                  />
                </pre>
              ))}
            </div>
          </details>
        )}
        {activity.gaps.length > 0 && (
          <details className="activity-step">
            <summary>Gaps · {activity.gaps.length}</summary>
            <div className="activity-step-body">
              <pre>
                <Highlight
                  value={activity.gaps
                    .map((gap) => `${gap.kind}: ${gap.expression}`)
                    .join("\n")}
                />
              </pre>
              <small className="muted">
                Unknown is something to learn. Inert means it exists and simply
                does not realize here, which is how markers and data are
                supposed to behave.
              </small>
            </div>
          </details>
        )}
        {(activity.problems.length > 0 || activity.rejected.length > 0) && (
          <details className="activity-step" open>
            <summary>Checks failed</summary>
            <div className="activity-step-body">
              <pre>
                <Highlight
                  value={[
                    ...activity.problems,
                    ...activity.rejected.map(
                      (r) => `${r.line}  <-- ${r.reason}`,
                    ),
                  ].join("\n")}
                />
              </pre>
            </div>
          </details>
        )}
        {activity.events.length > 0 && (
          <details className="activity-step">
            <summary>Trace · {activity.events.length} steps</summary>
            <div className="activity-step-body">
              <TraceDetail traceId="" events={activity.events} />
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

function TraceDetail({
  traceId,
  events,
}: {
  traceId: string;
  events: TraceEvent[];
}) {
  const eventsByParent = useMemo(() => {
    const grouped = new Map<string | null, TraceEvent[]>();
    for (const event of events) {
      const children = grouped.get(event.parentEventId) ?? [];
      children.push(event);
      grouped.set(event.parentEventId, children);
    }
    return grouped;
  }, [events]);
  const eventIds = useMemo(
    () => new Set(events.map((event) => event.id)),
    [events],
  );
  const roots = events.filter(
    (event) =>
      event.parentEventId === null || !eventIds.has(event.parentEventId),
  );
  return (
    <article className="trace-detail">
      <div className="trace-detail-heading">
        <div>
          <div className="muted editor-eyebrow">Evaluation trace</div>
          <h2>{traceId}</h2>
          <small className="muted">
            {events.length} Concept calls · expand any call to inspect its
            inputs, realization, output, and nested calls
          </small>
        </div>
      </div>
      {events.length ? (
        <div className="trace-tree">
          {roots.map((event) => (
            <TraceEventCard
              event={event}
              eventsByParent={eventsByParent}
              key={event.id}
            />
          ))}
        </div>
      ) : (
        <div className="trace-empty-state">
          <span className="muted">This trace has no recorded calls.</span>
        </div>
      )}
    </article>
  );
}

function TraceEventCard({
  event,
  eventsByParent,
}: {
  event: TraceEvent;
  eventsByParent: Map<string | null, TraceEvent[]>;
}) {
  const children = eventsByParent.get(event.id) ?? [];
  const input = prettyExpression(event.input);
  const args = event.arguments
    .map((argument) => prettyExpression(argument))
    .join(",\n  ");
  const evaluatedArgs = event.evaluatedArguments
    ?.map((argument) => prettyExpression(argument))
    .join(",\n  ");
  const selectedRealization = event.selectedRealization
    ? prettyExpression(event.selectedRealization)
    : "No realization selected";
  const output =
    event.output !== null ? prettyExpression(event.output) : "No output";
  return (
    <details
      className={"trace-card trace-" + event.outcome}
      open={event.parentEventId === null}
    >
      <summary>
        <span className="trace-concept-icon">◇</span>
        <strong>{event.concept}</strong>
        <span className="trace-caller">
          {event.caller} · {prettyExpression(event.useContext)}
        </span>
        <span className={"trace-outcome " + event.outcome}>
          {event.outcome}
        </span>
      </summary>
      <div className="trace-body">
        <div className="trace-event-meta">
          <span>Call {event.sequence + 1}</span>
          <span>{event.durationMs ?? "—"} ms</span>
          {event.parentEventId && <span>Parent {event.parentEventId}</span>}
          <time dateTime={event.startedAt}>
            {new Date(event.startedAt).toLocaleTimeString()}
          </time>
        </div>
        <TracePayload label="Input" value={input} />
        <TracePayload label="Arguments" value={"Arguments(" + args + ")"} />
        {evaluatedArgs !== undefined && (
          <TracePayload
            label="Evaluated arguments"
            value={"Arguments(" + evaluatedArgs + ")"}
          />
        )}
        <TracePayload
          label="Selected realization"
          value={selectedRealization}
        />
        <TracePayload label="Output" value={output} />
        {event.error && <div className="trace-error">{event.error}</div>}
        {event.externalExchanges.length > 0 && (
          <details className="trace-payload">
            <summary>
              External exchanges · {event.externalExchanges.length}
            </summary>
            <pre>
              <Highlight
                value={JSON.stringify(event.externalExchanges, null, 2)}
              />
            </pre>
          </details>
        )}
        {children.length > 0 && (
          <div className="trace-children">
            {children.map((child) => (
              <TraceEventCard
                event={child}
                eventsByParent={eventsByParent}
                key={child.id}
              />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function TracePayload({ label, value }: { label: string; value: string }) {
  return (
    <details className="trace-payload">
      <summary>
        {label} · {value.length.toLocaleString()} characters
      </summary>
      <pre>
        <Highlight value={value} />
      </pre>
    </details>
  );
}

function ConceptEditor({
  concept,
  onSave,
  onSelect,
}: {
  concept: ConceptUnit | null;
  onSave: (
    unit: ConceptUnit,
    relations: string,
    realizations: string,
  ) => Promise<boolean>;
  onSelect: (identity: string) => Promise<void>;
}) {
  const [relations, setRelations] = useState("");
  const [realizations, setRealizations] = useState("[]");
  const [saved, setSaved] = useState(false);
  const expressionPreview = useMemo(() => {
    const lines = relations
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      const relationValues = lines.map(parseExpression);
      return prettyExpression(
        // A Concept is three parts. There is no gloss and no meaning field: it describes
        // itself through its composition, its relations, or a Describe() realization.
        application("Concept", [
          { name: "identity", value: concept?.identity ?? "" },
          {
            name: "relations",
            // One generic collection. A collection Concept earns its own identity only
            // when it has a realization, and an inert list does not.
            value: application(
              "List",
              relationValues.map((value) => ({ value })),
            ),
          },
          { name: "realizations", value: application("List", []) },
        ]),
      );
    } catch (error) {
      return `That is not a Concept expression yet: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, [concept?.identity, relations]);
  useEffect(() => {
    setRelations((concept?.relations ?? []).join("\n"));
    setRealizations(JSON.stringify(concept?.realizations ?? [], null, 2));
    setSaved(false);
  }, [concept]);
  const links = useMemo(() => {
    const found = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      const object = value as {
        apply?: { head: string; args: Array<{ value: unknown }> };
      };
      if (!object.apply) return;
      found.add(object.apply.head);
      object.apply.args.forEach((argument) => visit(argument.value));
    };
    visit(concept?.relations);
    visit(concept?.realizations);
    return [...found].slice(0, 40);
  }, [concept]);
  if (!concept)
    return (
      <article className="concept-editor">
        <div className="empty-state">
          <div className="orb">◇</div>
          <h2>Concept network</h2>
          <p>
            Select a Concept to inspect its meaning, relations, and
            context-specific realizations.
          </p>
        </div>
      </article>
    );
  return (
    <article className="concept-editor">
      <div className="editor-heading">
        <div>
          <div className="muted editor-eyebrow">Concept unit</div>
          <h2>{concept.identity}</h2>
          <small className="muted">
            {concept.realizable ? "realizes" : "data"} ·{" "}
            {concept.usage?.selected ?? 0} selected ·{" "}
            {concept.usage?.residual ?? 0} residual
          </small>
        </div>
        <div className="editor-actions">
          <span className="save-state">{saved ? "Saved" : ""}</span>
          <button
            className="primary"
            onClick={() =>
              void onSave(concept, relations, realizations).then(setSaved)
            }
          >
            Save changes
          </button>
        </div>
      </div>
      <div className="field">
        <label>Derived relations · not stored</label>
        <div className="relation-map">
          {(concept.derived ?? [])
            .filter((relation) => !(concept.relations ?? []).includes(relation))
            .map((relation) => (
              <code className="derived-relation" key={relation}>
                {relation}
              </code>
            ))}
          {(concept.derived ?? []).filter(
            (relation) => !(concept.relations ?? []).includes(relation),
          ).length === 0 && <small>Nothing is derived for this Concept.</small>}
        </div>
        <small>
          Found through the index rather than held here. A symmetric relation
          appears on the end that does not store it, and a transitive one
          chains.
        </small>
      </div>
      <div className="field">
        <label>Cluster · reachable by equivalence and IsA</label>
        <div className="relation-map">
          {(concept.cluster ?? []).map((member) => (
            <button
              className="ghost relation-link"
              key={member.identity}
              onClick={() => void onSelect(member.identity)}
            >
              {member.identity} <span className="via">via {member.via}</span>
            </button>
          ))}
          {(concept.cluster ?? []).length === 0 && (
            <small>This Concept reaches nothing — it is an orphan.</small>
          )}
        </div>
        <small>
          Searching any member finds the whole cluster, which is also how a
          disconnected island is detected.
        </small>
      </div>
      <div className="field">
        <label>Realizations · how it means, or how it acts</label>
        <div className="realization-list">
          {(concept.realizations ?? []).map((r, index) => (
            <pre key={index} className={r.retired ? "retired" : ""}>
              <Highlight
                value={`${r.pattern}\n  context ${r.context || "any"}${
                  r.properties.length ? `\n  ${r.properties.join(" ")}` : ""
                }\n  => ${r.body}`}
              />
            </pre>
          ))}
          {(concept.realizations ?? []).length === 0 && (
            <small>
              No realizations. This Concept is data, and evaluating it yields
              itself.
            </small>
          )}
        </div>
        <small>
          Append-only. A newer realization with the same pattern and context
          shadows the older, which is retained rather than deleted.
        </small>
      </div>
      <div className="field">
        <label>Network links · Concept references in this unit</label>
        <div className="relation-map">
          {links.map((head) => (
            <button
              className="ghost relation-link"
              key={head}
              onClick={() => void onSelect(head)}
            >
              {head}
            </button>
          ))}
        </div>
        <small>Choose a linked Concept to open it in the browser.</small>
      </div>
      <div className="field concept-expression-field">
        <label>Concept expression syntax</label>
        <pre>
          <Highlight value={expressionPreview} />
        </pre>
        <small>
          This is the complete Concept unit expressed in the Concept language.
          It updates as you edit the fields below.
        </small>
      </div>
      <div className="field">
        <label>Relations · JSON array of Concept expressions</label>
        <textarea
          value={relations}
          onChange={(event) => setRelations(event.target.value)}
        />
        <details className="schema-guide" open>
          <summary>How the relations schema works</summary>
          <p>
            Each array item is one Concept expression describing a relation this
            Concept has to another Concept. The syntax preview above wraps these
            items in <code>ConceptRelations(...)</code>; the JSON field contains
            only the items inside that wrapper.
          </p>
          <pre>
            <Highlight
              value={[
                "ConceptRelations(",
                "  Produces(Date()),",
                "  Guides(PromptInput())",
                ")",
              ].join("\n")}
            />
          </pre>
          <dl>
            <div>
              <dt>Relation expression</dt>
              <dd>
                The relation call's head names the relationship, such as
                <code>Produces(...)</code>, <code>Guides(...)</code>, or
                <code>IsA(...)</code>. Its arguments identify the related
                Concept or Concepts.
              </dd>
            </div>
            <div>
              <dt>Several relations</dt>
              <dd>
                Add each supported relation as its own array item. The
                <code>ConceptRelations(...)</code> wrapper groups them into the
                Concept's relation collection.
              </dd>
            </div>
            <div>
              <dt>Empty relations</dt>
              <dd>
                An empty array means this Concept currently records no relation
                claims. It does not mean those claims are false.
              </dd>
            </div>
            <div>
              <dt>Relations are descriptive</dt>
              <dd>
                Recording a relation does not execute its arguments. A Concept
                such as <code>IsA(...)</code> can interpret graph relations when
                called, according to its own realizations.
              </dd>
            </div>
          </dl>
        </details>
      </div>
      <div className="field">
        <label>
          Realizations · JSON array of context-sensitive expressions
        </label>
        <textarea
          className="realizations-input"
          value={realizations}
          onChange={(event) => setRealizations(event.target.value)}
        />
        <details className="schema-guide" open>
          <summary>How the realization schema works</summary>
          <p>
            Each array item is one possible way for this Concept to realize. The
            runtime matches its pattern and context, then evaluates its body.
            Multiple realizations can live side by side; when contexts overlap,
            the most specific matching context is preferred.
          </p>
          <pre>
            <Highlight
              value={[
                "Realization(",
                "  pattern=Independence_Day_of_the_United_States(),",
                "  context=ThisYear(),",
                "  body=DateInYear(month=7, day=4)",
                ")",
              ].join("\n")}
            />
          </pre>
          <dl>
            <div>
              <dt>pattern · required</dt>
              <dd>
                The call shape this realization handles. Variables such as
                <code>$value</code> bind to the call's arguments and can be
                reused in the body.
              </dd>
            </div>
            <div>
              <dt>body · required</dt>
              <dd>
                The meaning or behavior to produce. It can be another composed
                Concept expression, a value such as
                <code>ConceptMeaning(...)</code>, or a host-backed expression
                such as <code>Code(...)</code>.
              </dd>
            </div>
            <div>
              <dt>context · optional</dt>
              <dd>
                Limits when this realization applies, for example
                <code>Execution()</code>, <code>NaturalLanguage()</code>, or
                <code>ThisYear()</code>. If omitted, it can match in any
                context.
              </dd>
            </div>
            <div>
              <dt>evaluateArguments · optional, defaults to true</dt>
              <dd>
                Set to <code>false</code> to match and use the original
                arguments without realizing them first.
              </dd>
            </div>
            <div>
              <dt>evaluateResult · optional, defaults to false</dt>
              <dd>
                Set to <code>true</code> to evaluate the body's returned
                expression once more.
              </dd>
            </div>
            <div>
              <dt>resultContext · optional</dt>
              <dd>
                For a composed body, choose the context used to evaluate it.
                This also applies to the extra evaluation requested by
                <code>evaluateResult</code>.
              </dd>
            </div>
          </dl>
          <p className="realization-guide-note">
            Keep alternatives together inside <code>Realizations(...)</code>.
            Each one is an ordinary Concept expression; the selected realization
            is recorded in the activity trace.
          </p>
        </details>
      </div>
      <div className="muted updated-at">
        Updated {concept.updatedAt ?? "not yet saved"}
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
