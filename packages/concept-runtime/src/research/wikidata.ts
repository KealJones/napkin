/**
 * Grounding a Concept in Wikidata: deterministic, sourced, and CC0.
 *
 * The Teacher was meant to help build the graph, and asked to recall what a word is it
 * invents: it taught emoji as a synonym of emoticon, where Wikidata states outright that
 * emoji is "different from" emoticon (Q1049294, P1889). So the classifying facts come from
 * Wikidata when it has them, and the Teacher is left what only it can do: behaviour, a new
 * relation's properties, and words Wikidata does not know.
 *
 * Only a small, closed set of relations is taken up front (judgment-research.md Part 6):
 * what a thing is, what it is not, what it is part of and made of, what it is for. The rest
 * of an item (dates, populations, the long tail) is for fetching when a question asks.
 *
 * Identity stays the name (concept-spec Part 3). The item is recorded as
 * `SameAs(Wikidata("Q..."))` on the Concept and on every Concept a relation points to, so
 * the next lookup of that word lands on the same sense instead of guessing again.
 */
import { call, c, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { nameOf } from "../ears/parser/names.js";

/**
 * Wikidata property to Napkin relation. Instance of is IsA ("is a" is its own alias on
 * Wikidata, and the graph already says `Greg_1 IsA Person`): K2 is a mountain. Subclass
 * of is SubclassOf, kind to kind, and it chains: a volcano is a kind of mountain, so
 * everything that is a volcano is a mountain. Folded together, what a thing is an instance
 * of would chain as though it were a kind.
 */
const PROPERTIES: Record<string, string> = {
  P31: "IsA",
  P279: "SubclassOf",
  P1889: "DistinctFrom",
  P361: "PartOf",
  P527: "HasPart",
  P366: "UsedFor",
};

/** Enough to cover a handful of classes without the list becoming a crawl of its own. */
const PER_PROPERTY = 4;

type Fetch = (url: string) => Promise<unknown>;

const API = "https://www.wikidata.org/w/api.php?";

const defaultFetch: Fetch = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "napkin/0.1 (concept graph)" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  return response.json();
};

interface Snak {
  mainsnak?: { datavalue?: { value?: { id?: string } } };
  rank?: string;
}

interface Entity {
  id: string;
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Snak[]>;
  lastrevid?: number;
}

/** The item a word most commonly names: the first search hit whose label is the word. */
async function findItem(word: string, get: Fetch): Promise<string | undefined> {
  const body = (await get(
    API + new URLSearchParams({ action: "wbsearchentities", search: word, language: "en", limit: "7", format: "json" }),
  )) as { search?: { id: string; label?: string; match?: { type?: string; text?: string } }[] };
  const want = word.toLowerCase();
  return (body.search ?? []).find(
    (hit) => hit.label?.toLowerCase() === want || (hit.match?.type === "alias" && hit.match.text?.toLowerCase() === want),
  )?.id;
}

async function entities(ids: readonly string[], props: string, get: Fetch): Promise<Record<string, Entity>> {
  if (!ids.length) return {};
  const body = (await get(
    API + new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"), props, languages: "en", format: "json" }),
  )) as { entities?: Record<string, Entity> };
  return body.entities ?? {};
}

/** The item a Concept was already tied to, if it was. */
export function wikidataItem(store: ConceptStore, identity: string): string | undefined {
  for (const t of store.asSubject(identity)) {
    if (t.predicate !== "SameAs" || t.object === undefined || t.object === null || typeof t.object !== "object" || !("head" in t.object)) continue;
    const q = t.object.head === "Wikidata" ? t.object.args[0]?.value : undefined;
    if (typeof q === "string") return q;
  }
  return undefined;
}

export interface Grounded {
  readonly item: string;
  readonly relations: readonly Expr[];
}

const readable = (identity: string): string => identity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

/**
 * Tie a Concept to its Wikidata item and take its classifying relations. Undefined when
 * Wikidata has no item for the word. A personal individual is never looked up: the world
 * does not know who the user's friend is (memory-spec Part 6.6).
 */
export async function groundInWikidata(
  store: ConceptStore,
  identity: string,
  options: { fetch?: Fetch; cause?: number } = {},
): Promise<Grounded | undefined> {
  if (/_\d+$/.test(identity)) return undefined;
  const get = options.fetch ?? defaultFetch;
  const item = wikidataItem(store, identity) ?? (await findItem(readable(identity), get));
  if (!item) return undefined;
  const entity = (await entities([item], "claims", get))[item];
  if (!entity) return undefined;

  const pairs: { relation: string; target: string }[] = [];
  for (const [property, relation] of Object.entries(PROPERTIES)) {
    const snaks = (entity.claims?.[property] ?? []).filter((s) => s.rank !== "deprecated");
    for (const snak of snaks.slice(0, PER_PROPERTY)) {
      const target = snak.mainsnak?.datavalue?.value?.id;
      if (target && !pairs.some((p) => p.relation === relation && p.target === target)) pairs.push({ relation, target });
    }
  }
  const labelled = await entities([...new Set(pairs.map((p) => p.target))], "labels", get);

  // One import stamp for the item, which every relation taken from it is sourced from.
  const imported = store.addRelation(
    "Wikidata",
    call("Imported", [{ value: item }, { name: "revision", value: entity.lastrevid ?? 0 }, { name: "license", value: "CC0" }]),
    undefined,
    options.cause,
  );
  const sameAs = (id: string, q: string) => store.addRelation(id, c("SameAs", call("Wikidata", [{ value: q }])), undefined, imported.seq);
  if (!wikidataItem(store, identity)) sameAs(identity, item);

  const relations: Expr[] = [];
  for (const { relation, target } of pairs) {
    const label = labelled[target]?.labels?.en?.value;
    if (!label) continue;
    const name = nameOf(label);
    if (!name || name === identity) continue;
    // The target is tied to its item too, unless that name already means another item.
    const known = wikidataItem(store, name);
    if (!known) sameAs(name, target);
    else if (known !== target) continue;
    const claim = c(relation, c(name));
    store.addRelation(identity, claim, undefined, imported.seq);
    relations.push(claim);
  }
  return { item, relations };
}
