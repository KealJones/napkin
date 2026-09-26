/**
 * What a visitor's graph starts from on the Pages site: the journal of what was learned here
 * (~/.napkin/store.ncon), without anyone's talk or identity. Kept: facts, meanings and
 * realizations, each with its provenance. Left out: every conversation (what was said) and
 * every user (who said it). Written to seed/store.ncon, which is committed; re-run to refresh.
 *
 *   pnpm --filter @napkin/studio-client seed [path/to/store.ncon]
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const from = resolve(process.argv[2] ?? process.env.NAPKIN_GRAPH ?? resolve(homedir(), ".napkin/store.ncon"));
const to = resolve(dirname(fileURLToPath(import.meta.url)), "../seed/store.ncon");

// A line about a conversation or a user: its subject, minted or seeded, is one of them.
const PRIVATE = /^(?:Assert|Realize|Retract|Forget|Mint|Seed)\((?:Concept\()?"?(?:Conversation_|IsolatedConversation_|User_)/;

const lines = readFileSync(from, "utf8").split("\n");
const kept = lines.filter((l) => l.trim() && !PRIVATE.test(l));
const dropped = lines.filter((l) => PRIVATE.test(l)).length;
mkdirSync(dirname(to), { recursive: true });
writeFileSync(to, kept.join("\n") + "\n");
console.log(`${kept.length} lines kept, ${dropped} private lines left out: ${to}`);
