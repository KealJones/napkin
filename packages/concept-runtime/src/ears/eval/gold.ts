/**
 * Reading `eval/ears/gold.md`, the intended reading for each message.
 *
 * Markdown rather than JSON because it is written and reviewed by people, and a reading
 * full of quotes is unreadable once escaped. The shape is strict so it stays parseable:
 *
 *   ## <id>
 *   category: <word>
 *   status: open                      (optional)
 *   ```history ... ```                (optional; "user:" and "answer:" lines)
 *   ```message ... ```
 *   ```reading ... ```
 *   Why: ...
 *
 * A fence may be longer than three backticks, so a message can itself contain a fence.
 */
import { readFileSync } from "node:fs";
import { lift } from "../lift.js";
import type { EvalCase } from "./score.js";

export interface GoldCase extends EvalCase {
  target: string;
  why: string;
}

function blocks(section: string): Map<string, string> {
  const found = new Map<string, string>();
  const lines = section.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(`{3,})([a-z]+)\s*$/.exec(lines[i]);
    if (!open) continue;
    const [, fence, kind] = open;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j] !== fence) body.push(lines[j++]);
    if (j === lines.length) throw new Error(`unclosed ${kind} block`);
    found.set(kind, body.join("\n"));
    i = j;
  }
  return found;
}

/** Split on `## ` headings, but never inside a fence: a message can contain markdown. */
function sections(markdown: string): string[] {
  const out: string[] = [];
  let fence = "";
  for (const line of markdown.split("\n")) {
    const marker = /^(`{3,})/.exec(line)?.[1];
    if (marker && !fence) fence = marker;
    else if (marker && line === fence) fence = "";
    if (!fence && line.startsWith("## ")) out.push(line.slice(3));
    else if (out.length) out[out.length - 1] += "\n" + line;
  }
  return out;
}

export function parseGold(markdown: string): GoldCase[] {
  const cases: GoldCase[] = [];
  for (const section of sections(markdown)) {
    const id = section.slice(0, section.indexOf("\n")).trim();
    const found = blocks(section);
    const message = found.get("message");
    const target = found.get("reading");
    // Sections without both are prose, such as the open questions at the end.
    if (message === undefined || target === undefined) continue;

    const lifted = lift(target);
    if (lifted.expression === undefined || lifted.rejected.length) {
      const why = lifted.rejected.map((r) => `${r.line}: ${r.reason}`).join("; ");
      throw new Error(`gold reading for ${id} is not valid IR: ${why}`);
    }

    const history: { message: string; spoken: string }[] = [];
    for (const line of (found.get("history") ?? "").split("\n")) {
      const user = /^user:\s*(.*)$/.exec(line);
      const answer = /^answer:\s*(.*)$/.exec(line);
      if (user) history.push({ message: user[1], spoken: "" });
      else if (answer && history.length) history[history.length - 1].spoken = answer[1];
    }

    cases.push({
      id,
      message,
      source: "gold",
      status: /^status:\s*open\s*$/m.test(section) ? "open" : undefined,
      history: history.length ? history : undefined,
      target,
      why: /^Why:\s*([\s\S]*?)(?:\n\n|$)/m.exec(section)?.[1].replace(/\s+/g, " ").trim() ?? "",
    });
  }
  return cases;
}

export const loadGold = (path: string): GoldCase[] => parseGold(readFileSync(path, "utf8"));
