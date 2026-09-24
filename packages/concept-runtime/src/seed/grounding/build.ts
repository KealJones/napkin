/**
 * Source dumps into grounding layers: the first slice of seed-dataset-sources, read with its
 * corrections.
 *
 * NGSL picks the words, about 2,800 of them. For each, Open English WordNet supplies the top
 * sense only: its `IsA`, its part and whole, its antonym, and its CILI id. ConceptNet supplies
 * what the thing does, `UsedFor`, `CapableOf`, `Causes`, which is the grounding
 * `judgment-research.md` Part 9.5 says the graph lacks. Each relation family is small and
 * closed (Part 6).
 *
 * What is left out, and why:
 *  - WordNet synonymy. It is per sense and a Napkin name is per word, so importing it
 *    between words rebuilds the `Identity` / `Chore` collapse (`design/README.md`).
 *  - Every sense but the first. A polysemous word with several `IsA` parents confuses
 *    ordering by inheritance distance (correction 2). The Teacher adds senses on demand.
 *  - Open-ended ConceptNet relations such as `RelatedTo`, and phrases as relation targets:
 *    "cut bread" is not one kind of thing, so it is not one name (reading-spec P4).
 *
 * Identity is the name (concept-spec Part 3). A CILI id is a relation on the Concept,
 * `SameAs(Cili("i46360"))`, never the identity.
 *
 *   node dist/seed/grounding/build.js [dumps dir] [layers dir]
 */
import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { gunzipSync, createGunzip } from "node:zlib";
import { nameOf } from "../../ears/parser/names.js";
import { DATA, type Layer, type LayerRelation, writeLayer } from "./layer.js";

/** A written form becomes a name only if it starts with a letter: "10" is not a Concept. */
const nameable = (w: string): boolean => /^[a-z]/i.test(w);

const text = (s: string): string => JSON.stringify(s);

/** Accumulates a layer's relations, once each. */
class Units {
  readonly map: Record<string, LayerRelation[]> = {};
  private readonly seen = new Set<string>();
  add(identity: string, claim: string, context?: string): void {
    const key = `${identity} ${claim} ${context ?? ""}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    (this.map[identity] ??= []).push(context === undefined ? claim : { claim, context });
  }
  has(identity: string, claim: string): boolean {
    return this.seen.has(`${identity} ${claim} `);
  }
}

/* ------------------------------------------------------------------ *
 * NGSL: the words, in frequency order.
 * ------------------------------------------------------------------ */

/**
 * The lemmas of an NGSL CSV, in rank order. The column is found by its "Lemma" header,
 * falling back to the first, because the published files differ in their other columns.
 */
export function readNgsl(csv: string): string[] {
  const [header, ...rows] = csv.split(/\r?\n/).filter((l) => l.trim());
  const at = Math.max(0, header.split(",").findIndex((h) => h.trim().toLowerCase() === "lemma"));
  const words = rows.map((r) => r.split(",")[at].trim().replace(/^"|"$/g, "").toLowerCase());
  return [...new Set(words.filter(nameable))];
}

/**
 * The NGSL layer says only that each word is a core word, by the written form it is known
 * by, the shape `ears/parser/names.ts` already mints: `Report  Named("report")`. The 1.2
 * stats file carries no part of speech; that comes from WordNet.
 */
export function ngslLayer(words: readonly string[]): Layer {
  const units = new Units();
  for (const w of words) units.add(nameOf(w), `Named(${text(w)})`);
  return {
    source: "Ngsl",
    version: "1.2",
    license: "CC BY-SA 4.0",
    url: "https://www.newgeneralservicelist.com/new-general-service-list",
    units: units.map,
  };
}

/* ------------------------------------------------------------------ *
 * Open English WordNet, WN-LMF XML.
 * ------------------------------------------------------------------ */

const POS: Record<string, string> = { n: "Noun", v: "Verb", a: "Adjective", s: "Adjective", r: "Adverb" };
/**
 * Which entry's first sense is a word's top sense when it has several parts of speech. Nouns
 * first: noun hypernymy is the deep, well-formed taxonomy; verb hypernymy is shallow and
 * adjectives have none. The dump carries no cross-entry frequency, so this is a rule, not a
 * measurement.
 */
const ORDER = "nvasr";

const unescape = (s: string): string =>
  s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()],
  );

const attributes = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = unescape(m[2]);
  return out;
};

const push = (map: Map<string, string[]>, key: string, value: string): void => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

interface Entry {
  lemma: string;
  pos: string;
  senses: string[];
}
interface Synset {
  ili: string;
  members: string[];
  relations: { type: string; target: string }[];
}

/**
 * The WN-LMF elements this needs carry everything in attributes, and each one's parent is
 * the last opened element of the parent kind, so a tag scan reads the 2024 release without
 * an XML dependency.
 */
function readWordNet(xml: string) {
  const entries = new Map<string, Entry>();
  const byLemma = new Map<string, string[]>();
  const senseEntry = new Map<string, string>();
  const senseSynset = new Map<string, string>();
  const antonyms = new Map<string, string[]>();
  const synsets = new Map<string, Synset>();
  let lexicon: Record<string, string> = {};
  let entry: Entry | undefined;
  let entryId = "";
  let sense = "";
  let synset: Synset | undefined;
  for (const m of xml.matchAll(/<(Lexicon|LexicalEntry|Lemma|Sense|SenseRelation|Synset|SynsetRelation)\s([^>]*)>/g)) {
    const a = attributes(m[2]);
    switch (m[1]) {
      case "Lexicon":
        lexicon = a;
        break;
      case "LexicalEntry":
        entryId = a.id;
        entry = { lemma: "", pos: "", senses: [] };
        entries.set(entryId, entry);
        break;
      case "Lemma":
        if (!entry) break;
        entry.lemma = a.writtenForm;
        entry.pos = a.partOfSpeech;
        push(byLemma, a.writtenForm.toLowerCase(), entryId);
        break;
      case "Sense":
        sense = a.id;
        entry?.senses.push(a.id);
        senseEntry.set(a.id, entryId);
        senseSynset.set(a.id, a.synset);
        break;
      case "SenseRelation":
        if (a.relType === "antonym") push(antonyms, sense, a.target);
        break;
      case "Synset":
        synset = { ili: a.ili ?? "", members: (a.members ?? "").split(/\s+/).filter(Boolean), relations: [] };
        synsets.set(a.id, synset);
        break;
      case "SynsetRelation":
        synset?.relations.push({ type: a.relType, target: a.target });
        break;
    }
  }
  return { lexicon, entries, byLemma, senseEntry, senseSynset, antonyms, synsets };
}

/**
 * The WordNet layer: for each word, part of speech from every entry, and from the top sense
 * only, `IsA`, part and whole, antonymy, and CILI.
 *
 * Part of speech is a fact about the word, not the thing: a report is not a noun. So it is
 * scoped to `Lexical()`, the facet for questions about words (seed-concepts Part 2), and
 * reads `PartOfSpeech(Noun())` there. This is the graph side of reading-spec R14; the parser
 * does not read it yet.
 *
 * Part and whole is stored once, on the part, as `PartOf`; `HasPart` is its inverse, derived
 * rather than materialized (concept-spec Part 5.3). The whole holds `HasPart` only when the
 * part is not itself a core word that already says so. Antonymy is symmetric and likewise
 * stored at one end.
 */
export function wordnetLayer(xml: string, words: readonly string[]): Layer {
  const wn = readWordNet(xml);
  const nameOfSynset = (id: string): string | undefined => {
    const lemma = wn.entries.get(wn.synsets.get(id)?.members[0] ?? "")?.lemma;
    return lemma && nameable(lemma) ? nameOf(lemma) : undefined;
  };
  const top = (word: string): string | undefined => {
    const ids = [...(wn.byLemma.get(word) ?? [])].sort(
      (a, b) => ORDER.indexOf(wn.entries.get(a)!.pos) - ORDER.indexOf(wn.entries.get(b)!.pos),
    );
    return ids.map((id) => wn.entries.get(id)!.senses[0]).find(Boolean);
  };

  const units = new Units();
  for (const word of words) {
    const name = nameOf(word);
    for (const id of wn.byLemma.get(word) ?? []) {
      const pos = POS[wn.entries.get(id)!.pos];
      if (pos) units.add(name, `PartOfSpeech(${pos}())`, "Lexical()");
    }
    const sense = top(word);
    if (!sense) continue;
    const synset = wn.synsets.get(wn.senseSynset.get(sense)!);
    if (!synset) continue;
    // "in" is OEWN's marker for a synset proposed to CILI and not yet given an id.
    if (/^i\d+$/.test(synset.ili)) units.add(name, `SameAs(Cili(${text(synset.ili)}))`);
    // One parent: several would reopen the ordering problem top-sense-only closes.
    const parent = synset.relations.find((r) => r.type === "hypernym" || r.type === "instance_hypernym");
    const parentName = parent && nameOfSynset(parent.target);
    if (parentName && parentName !== name) units.add(name, `IsA(${parentName}())`);
    for (const r of synset.relations) {
      const other = nameOfSynset(r.target);
      if (!other || other === name) continue;
      if (r.type === "holo_part") units.add(name, `PartOf(${other}())`);
      if (r.type === "mero_part") units.add(name, `HasPart(${other}())`);
    }
    for (const target of wn.antonyms.get(sense) ?? []) {
      const lemma = wn.entries.get(wn.senseEntry.get(target) ?? "")?.lemma;
      if (!lemma || !nameable(lemma)) continue;
      const other = nameOf(lemma);
      if (!units.has(other, `AntonymOf(${name}())`)) units.add(name, `AntonymOf(${other}())`);
    }
  }
  // A whole's HasPart is dropped when the part already says PartOf the whole.
  for (const [name, relations] of Object.entries(units.map)) {
    units.map[name] = relations.filter((r) => {
      const m = typeof r === "string" ? /^HasPart\((\w+)\(\)\)$/.exec(r) : null;
      return !m || !units.has(m[1], `PartOf(${name}())`);
    });
  }
  return {
    source: "OpenEnglishWordNet",
    version: wn.lexicon.version ?? "",
    license: wn.lexicon.license ?? "",
    url: wn.lexicon.url ?? "",
    units: units.map,
  };
}

/* ------------------------------------------------------------------ *
 * ConceptNet assertions CSV.
 * ------------------------------------------------------------------ */

const FUNCTIONAL = new Set(["UsedFor", "CapableOf", "Causes"]);
/** `/c/en/knife` or `/c/en/knife/n`, one word only. */
const TERM = /^\/c\/en\/([a-z]+)(?:\/|$)/;

/**
 * The ConceptNet layer: what a core word's thing does. An assertion line is
 * `uri \t /r/Rel \t /c/en/start \t /c/en/end \t json`; only the three functional relations,
 * English at both ends, a core word as subject and a single word as object.
 */
export async function conceptnetLayer(lines: AsyncIterable<string> | Iterable<string>, words: readonly string[]): Promise<Layer> {
  const core = new Set(words);
  const units = new Units();
  for await (const line of lines) {
    const [, rel, start, end] = line.split("\t", 4);
    const relation = rel?.slice(3);
    if (!relation || !FUNCTIONAL.has(relation)) continue;
    const s = TERM.exec(start)?.[1];
    const o = TERM.exec(end)?.[1];
    if (!s || !o || !core.has(s) || s === o) continue;
    units.add(nameOf(s), `${relation}(${nameOf(o)}())`);
  }
  return {
    source: "ConceptNet",
    version: "5.7.0",
    license: "CC BY-SA 4.0",
    url: "https://github.com/commonsense/conceptnet5/wiki/Downloads",
    units: units.map,
  };
}

const readText = (path: string): string =>
  path.endsWith(".gz") ? gunzipSync(readFileSync(path)).toString("utf8") : readFileSync(path, "utf8");

/** Line by line, because the ConceptNet dump is about 10 GB uncompressed. */
const readLines = (path: string): AsyncIterable<string> => {
  const raw = createReadStream(path);
  return createInterface({ input: path.endsWith(".gz") ? raw.pipe(createGunzip()) : raw, crlfDelay: Infinity });
};

/** Build all three layers from the dumps `fetch.sh` downloads. */
export async function build(dumps: string, layers: string, files = DUMPS): Promise<string[]> {
  const words = readNgsl(readText(join(dumps, files.ngsl)));
  return [
    writeLayer(layers, "ngsl", ngslLayer(words)),
    writeLayer(layers, "oewn", wordnetLayer(readText(join(dumps, files.wordnet)), words)),
    writeLayer(layers, "conceptnet", await conceptnetLayer(readLines(join(dumps, files.conceptnet)), words)),
  ];
}

export const DUMPS = {
  ngsl: "NGSL_1.2_stats.csv",
  wordnet: "english-wordnet-2024.xml.gz",
  conceptnet: "conceptnet-assertions-5.7.0.csv.gz",
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dumps = join(DATA, "dumps"), layers = join(DATA, "layers")] = process.argv.slice(2);
  for (const path of await build(dumps, layers)) console.log(path);
}
