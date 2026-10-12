import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readFile } from "../runtime/host.js";
import { boundTrace } from "./traces.js";

test("the trace file is kept under its limit, the newest turns whole, the oldest let go", () => {
  const dir = mkdtempSync(join(tmpdir(), "napkin-trace-"));
  const path = join(dir, "trace.jsonl");
  const line = (turn: number, i: number) => JSON.stringify({ id: `${turn}-${i}`, traceId: `t${turn}`, pad: "x".repeat(80) });
  const lines = Array.from({ length: 40 }, (_, turn) => Array.from({ length: 5 }, (_, i) => line(turn, i))).flat();
  writeFileSync(path, lines.join("\n") + "\n");
  const before = readFileSync(path, "utf8").length;
  boundTrace(path, Math.floor(before / 2));
  const kept = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { traceId: string });
  assert.ok(readFileSync(path, "utf8").length <= before / 4 + 200, "within half the limit");
  const turns = new Set(kept.map((e) => e.traceId));
  for (const t of turns) assert.equal(kept.filter((e) => e.traceId === t).length, 5, `turn ${t} kept whole`);
  assert.ok(turns.has("t39") && !turns.has("t0"), "the newest kept, the oldest gone");
});

test("a message names files under the workspace, not elsewhere under home", () => {
  const home = mkdtempSync(join(tmpdir(), "napkin-home-"));
  writeFileSync(join(home, "secret.txt"), "not for messages");
  const was = { home: process.env.HOME, read: process.env.NAPKIN_READ_HOME };
  process.env.HOME = home;
  delete process.env.NAPKIN_READ_HOME;
  try {
    assert.equal(readFile("~/secret.txt"), undefined);
    process.env.NAPKIN_READ_HOME = "1";
    assert.equal(readFile("~/secret.txt")?.text, "not for messages", "allowed when the person running it says so");
  } finally {
    process.env.HOME = was.home;
    if (was.read === undefined) delete process.env.NAPKIN_READ_HOME;
    else process.env.NAPKIN_READ_HOME = was.read;
  }
});
