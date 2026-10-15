/**
 * A teacher for what nothing else Napkin reads has: asked only once the graph, the dictionary,
 * Wikidata, ATOMIC and ConceptNet have left a gap open. It TEACHES: what it says is kept as facts
 * in relations the graph already has (asked for by name, anything else dropped), each sourced
 * from one stamp per thing taught (`Teacher Taught("gunwale", model=, as="word")`), so all it
 * taught is separable, and is not asked again. Napkin then answers from what it holds, as from
 * anything else learned; the teacher's own words are never the reply.
 *
 * The teacher is a model behind a plain call (`Ask`: a prompt in, text out). Taking long is fine:
 * what is taught is kept, and the next time the gap is not there.
 */
import { c, call, isCall, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { nameOf } from "../ears/parser/names.js";
import { keepReading } from "../resolve/learned.js";
import { ATOMIC } from "./atomic.js";

/** A model asked: the prompt in, its text out. */
export type Ask = (prompt: string) => Promise<string>;

const WORKER = "https://pocket-gemini.kealjones.workers.dev/v1/generate";

/** Gemini through the worker; a busy upstream (5xx) is asked once more. */
export function geminiTeacher(url = WORKER, timeout = 120_000): Ask {
  return async (prompt) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(timeout),
      });
      if (response.status >= 500 && attempt < 1) {
        await new Promise((done) => setTimeout(done, 1500));
        continue;
      }
      if (!response.ok) throw new Error(`teacher ${response.status}`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    }
  };
}

/** The JSON in what a model said, fenced or not. */
export function jsonIn(text: string): Record<string, unknown> | undefined {
  const body = text.replace(/```(?:json)?/g, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether this was taught before, found or not. */
export function taughtBefore(store: ConceptStore, term: string, as: string): boolean {
  return store.asSubject("Teacher").some((t) => t.predicate === "Taught" && isCall(t.expr) && t.expr.args[0]?.value === term && t.expr.args.some((a) => a.name === "as" && a.value === as));
}

const stamp = (store: ConceptStore, term: string, as: string, model: string, cause?: number) =>
  store.addRelation("Teacher", call("Taught", [{ value: term }, { name: "model", value: model }, { name: "as", value: as }]), undefined, cause).seq;

/** Short phrases only, each a Concept by its words ("structural support" StructuralSupport). */
const phrases = (v: unknown, most = 3): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.toLowerCase().replace(/^(to|a|an|the)\s+/, "").replace(/[.!]+$/, "").trim())
    .filter((x) => x && x.split(/\s+/).length <= 5 && !/[{}<>]/.test(x))
    .slice(0, most);

/** The relations a word is taught in: those of them the graph has. */
const WORD_RELATIONS = ["IsA", "PartOf", "UsedFor", "HasProperty"] as const;

export interface Taught {
  readonly identity: string;
  readonly relations: Expr[];
  /** Taken for a misspelling of this word. */
  readonly meant?: string;
  /** Taken for a name: of someone, a place, or something. */
  readonly name?: "Person" | "Place" | "Thing";
}

/**
 * A word nothing found: taught what it is where it was said. It may be a word (what it means, what
 * it is, part of, used for), a misspelling of a word (that word, kept as a reading of what was
 * typed), or a name (of someone, a place, a thing).
 */
export async function teachWord(
  store: ConceptStore,
  identity: string,
  word: string,
  said: string,
  options: { ask: Ask; cause?: number; model?: string; asks?: readonly string[] },
): Promise<Taught | undefined> {
  const term = word.toLowerCase();
  if (!term || taughtBefore(store, term, "word")) return undefined;
  const relations = WORD_RELATIONS.filter((r) => store.has(r));
  const asked = options.asks?.length ? ` It was asked as ${options.asks.join(" or ")}.` : "";
  const prompt = [
    `A knowledge graph met the word "${word}" in: "${said}".${asked}`,
    `Say what "${word}" is there. Reply with only JSON:`,
    `{"kind": "word" | "misspelling" | "name" | "unknown", "meant": the intended word if a misspelling, "nameOf": "person" | "place" | "thing" if a name,`,
    ` "means": one short definition if a word, ${relations.map((r) => `"${r}": [short lowercase noun phrases]`).join(", ")}}`,
    `Use "unknown" rather than guess. No sentences outside the JSON.`,
  ].join("\n");
  const text = await options.ask(prompt);
  const taught = jsonIn(text);
  const source = stamp(store, term, "word", options.model ?? "gemini", options.cause);
  if (!taught) return { identity, relations: [] };
  const kept: Expr[] = [];
  const keep = (claim: Expr) => {
    store.addRelation(identity, claim, undefined, source);
    kept.push(claim);
  };
  const kind = String(taught.kind ?? "").toLowerCase();
  if (kind === "misspelling" && typeof taught.meant === "string" && /^[a-z][a-z' -]*$/i.test(taught.meant) && taught.meant.toLowerCase() !== term) {
    const meant = taught.meant.toLowerCase();
    keepReading(store, term, meant);
    return { identity, relations: [], meant };
  }
  if (kind === "name") {
    const of = String(taught.nameOf ?? "").toLowerCase();
    const name = of === "person" ? "Person" : of === "place" ? "Place" : "Thing";
    keep(c("IsA", c("Name")));
    if (name !== "Thing" && store.has(name)) keep(c("IsA", c(name)));
    return { identity, relations: kept, name };
  }
  if (kind !== "word") return { identity, relations: [] };
  if (typeof taught.means === "string" && taught.means.trim() && store.has("Means")) keep(call("Means", [{ value: taught.means.trim() }]));
  for (const relation of relations) {
    for (const p of phrases(taught[relation])) {
      const target = nameOf(p);
      if (target && /^[A-Z]/.test(target) && target !== identity) keep(c(relation, c(target)));
    }
  }
  return { identity, relations: kept };
}

/**
 * An everyday event nothing found: taught in ATOMIC's own relations, how the one it happens to
 * feels, wants, what it does to them, needs first, why one would, and how others feel and want.
 */
export async function teachEvent(store: ConceptStore, term: string, told: string, options: { ask: Ask; cause?: number; model?: string }): Promise<{ identity: string; relations: Expr[] }> {
  const identity = nameOf(term);
  if (!identity || taughtBefore(store, term, "event")) return { identity, relations: [] };
  const keys = Object.keys(ATOMIC);
  const prompt = [
    `Someone says: "${told}". As ATOMIC 2020 would for the event "${term}", reply with only JSON:`,
    `{${keys.map((k) => `"${k}": [up to 3 short phrases]`).join(", ")}}`,
    `xReact and oReact are feeling words ("frustrated"); xWant, oWant, xNeed, xIntent start with a verb ("call a mechanic"); xEffect is what happens to them. No PersonX, no sentences.`,
  ].join("\n");
  const taught = jsonIn(await options.ask(prompt));
  const source = stamp(store, term, "event", options.model ?? "gemini", options.cause);
  const kept: Expr[] = [];
  if (!taught) return { identity, relations: kept };
  for (const key of keys) {
    const head = ATOMIC[key as keyof typeof ATOMIC];
    for (const p of phrases(taught[key] ?? taught[key.toLowerCase()])) {
      if (/person[xyz]/i.test(p)) continue;
      const target = nameOf(p);
      if (!target || !/^[A-Z]/.test(target) || target === identity) continue;
      const claim = c(head, c(target));
      store.addRelation(identity, claim, undefined, source);
      kept.push(claim);
    }
  }
  return { identity, relations: kept };
}
