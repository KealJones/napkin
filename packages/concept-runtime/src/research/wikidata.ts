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
import { call, c, isCall, type Expr } from "../concept/expression.js";
import type { ConceptStore } from "../store/store.js";
import { nameOf } from "../ears/parser/names.js";
import { lemma, words } from "../runtime/host.js";

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
  // What a person is, by what they do: Steven Spielberg is a film director.
  P106: "IsA",
};

/** Enough to cover a handful of classes without the list becoming a crawl of its own. */
const PER_PROPERTY = 4;

type Fetch = (url: string) => Promise<unknown>;

// `origin=*`: an anonymous CORS request, so a browser host can read the answer too.
const API = "https://www.wikidata.org/w/api.php?origin=*&";

/**
 * Politely: one call at a time with a gap between, a User-Agent that says who is asking
 * (Wikimedia's policy), and a 429 answered by waiting as long as it says, then trying again.
 */
let last = 0;
const defaultFetch: Fetch = async (url) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = last + 250 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const response = await fetch(url, {
      headers: { "user-agent": "Napkin/0.1 (https://github.com/KealJones/napkin; concept graph grounding)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 429) {
      const after = Number(response.headers.get("retry-after") ?? "") || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(after, 30) * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Wikidata ${response.status}`);
    return response.json();
  }
  throw new Error("Wikidata 429: still rate limited after retrying");
};

interface Snak {
  mainsnak?: {
    snaktype?: string;
    datatype?: string;
    datavalue?: { value?: { id?: string; time?: string; precision?: number; amount?: string; unit?: string } };
  };
  rank?: string;
}

interface Entity {
  id: string;
  labels?: Record<string, { value: string }>;
  claims?: Record<string, Snak[]>;
  lastrevid?: number;
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
    // A retracted tie was the wrong item, and is not reused.
    const q = t.object.head === "Wikidata" && !store.retracted(identity, t.expr) ? t.object.args[0]?.value : undefined;
    if (typeof q === "string") return q;
  }
  return undefined;
}

export interface Grounded {
  readonly item: string;
  readonly relations: readonly Expr[];
}

const readable = (identity: string): string => identity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

interface Sense {
  readonly id: string;
  readonly description: string;
  readonly sitelinks: number;
  /** What it is an instance or subclass of, as labels: "frozen dessert", "single". */
  readonly kinds: readonly string[];
}

interface Described extends Entity {
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, unknown>;
}

/** The Wikidata item of the English Wikipedia article a word is the title of, redirects followed. */
async function primaryTopic(word: string, get: Fetch): Promise<string | undefined> {
  try {
    const body = (await get(
      "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ action: "query", titles: word, redirects: "1", prop: "pageprops", ppprop: "wikibase_item", format: "json" }),
    )) as { query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string; disambiguation?: string } }> } };
    const page = Object.values(body.query?.pages ?? {})[0];
    return page?.pageprops?.disambiguation === undefined ? page?.pageprops?.wikibase_item : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every item the word is the exact label or alias of, and the item of the article it names.
 * Wikidata's own pages (disambiguation pages, deprecation reasons) are records about Wikidata,
 * not things a word names.
 */
async function findSenses(word: string, get: Fetch): Promise<Sense[]> {
  const body = (await get(
    API + new URLSearchParams({ action: "wbsearchentities", search: word, language: "en", limit: "10", format: "json" }),
  )) as { search?: { id: string; label?: string; match?: { type?: string; text?: string } }[] };
  const want = word.toLowerCase();
  const labelled = (body.search ?? [])
    .filter((hit) => hit.label?.toLowerCase() === want || (hit.match?.type === "alias" && hit.match.text?.toLowerCase() === want))
    .map((hit) => hit.id);
  // The search is by prefix, so the sense most of the world means can be missing ("pi" finds a
  // family name, not the number): the item of the Wikipedia article the word names is one too.
  const primary = await primaryTopic(word, get);
  const ids = [...new Set([...(primary ? [primary] : []), ...labelled])];
  const found = (await entities(ids, "claims|descriptions|sitelinks", get)) as Record<string, Described>;
  const kindsOf = (e: Described) =>
    ["P31", "P279"].flatMap((p) => (e.claims?.[p] ?? []).map((snak) => snak.mainsnak?.datavalue?.value?.id).filter((q): q is string => !!q));
  const labels = await entities([...new Set(Object.values(found).flatMap(kindsOf))], "labels", get);
  return ids
    .map((id) => found[id])
    .filter((e): e is Described => !!e)
    .map((e) => ({
      id: e.id,
      description: e.descriptions?.en?.value ?? "",
      sitelinks: Object.keys(e.sitelinks ?? {}).length,
      kinds: kindsOf(e).map((q) => labels[q]?.labels?.en?.value).filter((l): l is string => !!l),
    }))
    .filter((sense) => !sense.kinds.some((k) => /^(Wikimedia|Wikibase) /.test(k)));
}

/**
 * The senses that fit what was said: those whose description or kind shares a word with
 * the message and the conversation around it ("i'd love a bowl of ice cream" shares
 * nothing with a single and "dessert" with the food only when it is said). One sense fits,
 * or none does and every sense is kept, each in its own context, to ask about.
 */
function fitting(senses: readonly Sense[], word: string, said: string): readonly Sense[] {
  const own = new Set(word.toLowerCase().split(/\s+/));
  const words = new Set((said.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 3 && !own.has(w)));
  // A word said fits a word of the sense when either begins the other: "math" fits "mathematical".
  const fits = (w: string) => w.length > 3 && [...words].some((x) => w.startsWith(x) || x.startsWith(w));
  const score = (sense: Sense) =>
    [...new Set([sense.description, ...sense.kinds].join(" ").toLowerCase().match(/[a-z]+/g) ?? [])].filter(fits).length;
  const scored = senses.map((sense) => ({ sense, score: score(sense) }));
  const best = Math.max(0, ...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  if (best > 0 && top.length === 1) return [top[0].sense];
  return senses;
}

/** A handful of senses, the ones most of the world writes about first. */
const SENSES = 3;

/**
 * Tie a Concept to its Wikidata item and take its classifying relations. Undefined when
 * Wikidata has no item for the word. A personal individual is never looked up: the world
 * does not know who the user's friend is (memory-spec Part 6.6).
 *
 * The item is the sense that fits what was said, never the first label: "ice cream" once
 * became the Blackpink single. When nothing said picks one, each sense is learned in its own
 * context, named by its kind (`In(FrozenDessert())`, `In(Single())`), with what it is, so
 * the one meant can be asked about.
 */
export async function groundInWikidata(
  store: ConceptStore,
  identity: string,
  options: { fetch?: Fetch; cause?: number; said?: string } = {},
): Promise<Grounded | undefined> {
  if (/_\d+$/.test(identity)) return undefined;
  const get = options.fetch ?? defaultFetch;
  const tied = wikidataItem(store, identity);
  const senses = tied ? [{ id: tied, description: "", sitelinks: 0, kinds: [] }] : fitting(await findSenses(readable(identity), get), readable(identity), options.said ?? "");
  if (!senses.length) return undefined;
  // One sense the world writes about far more than any other is the one meant when nothing said
  // picks one ("pi" is the number, not the family name; France the country, not the battleship).
  const ranked = [...senses].sort((a, b) => b.sitelinks - a.sitelinks);
  const dominant = ranked.length > 1 && ranked[0].sitelinks >= 20 && ranked[0].sitelinks >= 3 * ranked[1].sitelinks ? [ranked[0]] : undefined;
  const one = senses.length === 1 || dominant !== undefined;
  // A sense's context is named by its kind, unless that name already means something here:
  // the kind "concept" is not the universal parent.
  const kind = (sense: Sense) => sense.kinds.map(nameOf).find((k) => /^[A-Z]/.test(k) && !(store.get(k)?.realizations.length ?? 0));
  const chosen = dominant ?? (one ? senses : ranked.filter((x) => kind(x)).slice(0, SENSES));
  const relations: Expr[] = [];
  for (const sense of chosen) {
    const context = one ? undefined : c(kind(sense)!);
    relations.push(...(await groundSense(store, identity, sense, context, get, options.cause)));
  }
  return { item: chosen.map((x) => x.id).join(", "), relations };
}

async function groundSense(
  store: ConceptStore,
  identity: string,
  sense: Sense,
  context: Expr | undefined,
  get: Fetch,
  cause: number | undefined,
): Promise<Expr[]> {
  const item = sense.id;
  const entity = (await entities([item], "claims", get))[item];
  if (!entity) return [];

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
    cause,
  );
  const sameAs = (id: string, q: string, within?: Expr) => store.addRelation(id, c("SameAs", call("Wikidata", [{ value: q }])), within, imported.seq);
  if (context !== undefined) sameAs(identity, item, context);
  else if (!wikidataItem(store, identity)) sameAs(identity, item);

  const relations: Expr[] = [];
  const keep = (claim: Expr) => {
    store.addRelation(identity, claim, context, imported.seq);
    relations.push(context === undefined ? claim : call("In", [{ value: claim }, { value: context }]));
  };
  // What it is, in the words Wikidata describes it with ("semi-aquatic egg-laying mammal endemic
  // to Australia"): said first when it is described, and what tells senses apart. The kind the
  // description names (its last noun before any "of", "to", "in": a mammal) is what it is.
  if (sense.description) {
    keep(call("Means", [{ value: sense.description }]));
    const kind = kindOfDescription(sense.description);
    if (kind && kind !== identity) keep(call("IsA", [{ value: c(kind) }]));
  }
  await everyClaim(store, identity, entity, keep, sameAs, get);
  for (const { relation, target } of pairs) {
    const label = labelled[target]?.labels?.en?.value;
    if (!label) continue;
    const name = nameOf(label);
    // A name has to be a Concept name: "3" is not one.
    if (!name || name === identity || !/^[A-Z]/.test(name)) continue;
    // A Concept that realizes something already means something here: Wikidata's
    // "concept" is not the universal parent, however the label reads.
    if (!wikidataItem(store, name) && (store.get(name)?.realizations.length ?? 0) > 0) continue;
    // The target is tied to its item too, unless that name already means another item.
    const known = wikidataItem(store, name);
    if (!known) sameAs(name, target);
    else if (known !== target) continue;
    keep(c(relation, c(name)));
  }
  return relations;
}

/**
 * "No, I mean the math term", said of a thing just described: the sense it was taken in is not
 * the one meant. What that sense holds is kept, in a context named by its kind (Pi is still a
 * family name), and the word's other senses are looked up for the one the words said fit. The
 * sense found, learned in its own context; undefined when the words fit none, or several.
 */
export async function regroundSense(
  store: ConceptStore,
  identity: string,
  said: string,
  options: { fetch?: Fetch; cause?: number } = {},
): Promise<Grounded | undefined> {
  const get = options.fetch ?? defaultFetch;
  const tied = wikidataItem(store, identity);
  const unit = store.get(identity);
  if (tied && unit) {
    const loose = unit.relations.filter((r) => r.context === undefined && r.stamps?.length && r.stamps.every((st) => st.pack === undefined));
    let kind: string | undefined;
    for (const r of loose) {
      const cl = r.claim;
      const target = isCall(cl) && cl.head === "IsA" ? cl.args[0]?.value : undefined;
      if (target !== undefined && isCall(target)) {
        kind = target.head;
        break;
      }
    }
    if (kind) {
      const seqs = new Set<number>();
      for (const r of loose) {
        store.addRelation(identity, r.claim, c(kind), r.stamps![0].source);
        for (const st of r.stamps!) seqs.add(st.seq);
      }
      store.collect(seqs);
    }
  }
  const found = fitting((await findSenses(readable(identity), get)).filter((x) => x.id !== tied), readable(identity), said);
  if (found.length !== 1) return undefined;
  const sense = found[0];
  const kind = sense.kinds.map(nameOf).find((k) => /^[A-Z]/.test(k) && !(store.get(k)?.realizations.length ?? 0));
  const relations = await groundSense(store, identity, sense, kind ? c(kind) : undefined, get, options.cause);
  return { item: sense.id, relations };
}

/**
 * Whether one item is a kind of another in the world's own hierarchy: from `from`, up what it is
 * a subclass of, an instance of, and (for living things) its parent taxon, breadth first, until
 * `to` is reached or the search runs out. The items on the way, or undefined.
 */
export async function reachesInWikidata(from: string, to: string, options: { fetch?: Fetch; limit?: number } = {}): Promise<string[] | undefined> {
  const get = options.fetch ?? defaultFetch;
  const limit = options.limit ?? 200;
  const came = new Map<string, string | undefined>([[from, undefined]]);
  let frontier = [from];
  let seen = 0;
  while (frontier.length && seen < limit) {
    const batch = frontier.slice(0, 40);
    frontier = frontier.slice(40);
    seen += batch.length;
    const found = await entities(batch, "claims", get);
    for (const id of batch) {
      // Parent taxon first: a living thing's line to what it is runs through its taxa.
      for (const property of ["P171", "P279", "P31"]) {
        for (const snak of found[id]?.claims?.[property] ?? []) {
          const up = snak.mainsnak?.datavalue?.value?.id;
          if (!up || came.has(up)) continue;
          came.set(up, id);
          if (up === to) {
            const path = [to];
            for (let at: string | undefined = id; at !== undefined; at = came.get(at)) path.unshift(at);
            return path;
          }
          frontier.push(up);
        }
      }
    }
  }
  return undefined;
}

/**
 * The kind a description names: its last plain noun before the first preposition or joining word
 * ("semi-aquatic egg-laying mammal endemic to Australia" is a Mammal, "constant ratio of the
 * circumference..." a Ratio, "American film director" a Director), by the tagger hearing uses.
 */
export function kindOfDescription(description: string): string | undefined {
  let last: string | undefined;
  for (const w of words(description)) {
    if (w.tags.some((t) => t === "Preposition" || t === "Conjunction")) break;
    if (w.tags.includes("Noun") && !w.tags.includes("ProperNoun") && !w.tags.includes("Hyphenated") && !w.tags.includes("Possessive")) last = w.text;
  }
  if (!last) return undefined;
  const base = lemma(last.toLowerCase());
  return /^[a-z]+$/.test(base) ? base[0].toUpperCase() + base.slice(1) : undefined;
}

/** How many of an item's other properties are taken, and of each how many values. */
const MORE_PROPERTIES = 40;

/**
 * Wikidata's own bookkeeping, not facts about the thing: its categories, templates, pictures,
 * sources and the like. Read off each property's label, which says what the property is for.
 */
const BOOKKEEPING = /wikimedia|category|template|described by|main subject|commons|image|logo|flag|coat of arms|seal|signature|audio|video|map|pronunciation|social media|website|gallery|icon|list of|topic's|said to be the same|different from|page banner|locator/i;

/**
 * Everything else an item says that is a fact with a value Napkin can hold: another item (where
 * he was born), a date (when), a quantity (how many, how high). Named by the property's own label
 * ("place of birth" is PlaceOfBirth), a few values each, from the same import. Identifiers and
 * free text are left: they are not relations.
 */
async function everyClaim(
  store: ConceptStore,
  identity: string,
  entity: Entity,
  keep: (claim: Expr) => void,
  sameAs: (id: string, q: string) => unknown,
  get: Fetch,
): Promise<void> {
  const taken: { property: string; values: NonNullable<NonNullable<Snak["mainsnak"]>["datavalue"]>["value"][]; type: string }[] = [];
  for (const [property, snaks] of Object.entries(entity.claims ?? {})) {
    if (property in PROPERTIES) continue;
    const good = snaks.filter((s) => s.rank !== "deprecated" && s.mainsnak?.snaktype === "value" && s.mainsnak.datavalue?.value);
    const type = good[0]?.mainsnak?.datatype ?? "";
    if (!["wikibase-item", "time", "quantity"].includes(type)) continue;
    const preferred = good.filter((s) => s.rank === "preferred");
    taken.push({ property, type, values: (preferred.length ? preferred : good).slice(0, PER_PROPERTY).map((s) => s.mainsnak!.datavalue!.value) });
    if (taken.length >= MORE_PROPERTIES) break;
  }
  if (!taken.length) return;
  const ids = new Set<string>();
  for (const t of taken) {
    ids.add(t.property);
    for (const v of t.values) {
      if (v?.id) ids.add(v.id);
      const unit = v?.unit?.split("/").pop();
      if (unit && unit !== "1") ids.add(unit);
    }
  }
  const labels: Record<string, Entity> = {};
  const all = [...ids];
  for (let i = 0; i < all.length; i += 50) Object.assign(labels, await entities(all.slice(i, i + 50), "labels", get));
  const label = (q: string) => labels[q]?.labels?.en?.value;
  for (const t of taken) {
    const said = label(t.property);
    if (!said || BOOKKEEPING.test(said)) continue;
    const relation = nameOf(said);
    if (!relation || !/^[A-Z]/.test(relation)) continue;
    for (const v of t.values) {
      if (!v) continue;
      if (t.type === "wikibase-item" && v.id) {
        const name = nameOf(label(v.id) ?? "");
        if (!name || name === identity || !/^[A-Z]/.test(name)) continue;
        if (!wikidataItem(store, name) && (store.get(name)?.realizations.length ?? 0) > 0) continue;
        const known = wikidataItem(store, name);
        if (!known) sameAs(name, v.id);
        else if (known !== v.id) continue;
        keep(c(relation, c(name)));
      } else if (t.type === "time" && v.time) {
        const when = dateOf(v.time, v.precision);
        if (when) keep(call(relation, [{ value: when }]));
      } else if (t.type === "quantity" && v.amount !== undefined) {
        const n = Number(v.amount);
        if (!Number.isFinite(n)) continue;
        const unit = v.unit?.split("/").pop();
        const unitName = unit && unit !== "1" ? nameOf(label(unit) ?? "") : undefined;
        keep(call(relation, [{ value: unitName ? call("Quantity", [{ value: n }, { name: "unit", value: c(unitName) }]) : n }]));
      }
    }
  }
}

/**
 * A Wikidata time as the Date the graph holds dates as (Date(year=..., month=..., day=...,
 * weekday=...), what "what's the date" gives), as precise as Wikidata says it is: a day, a month,
 * or only a year.
 */
export function dateOf(time: string, precision = 11): Expr | undefined {
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(time);
  if (!m) return undefined;
  const year = (m[1] === "-" ? -1 : 1) * Number(m[2]);
  const parts: { name: string; value: Expr }[] = [{ name: "year", value: year }];
  if (precision >= 10) parts.push({ name: "month", value: Number(m[3]) });
  if (precision >= 11) {
    parts.push({ name: "day", value: Number(m[4]) });
    const at = new Date(Date.UTC(year, Number(m[3]) - 1, Number(m[4])));
    if (year > 0) parts.push({ name: "weekday", value: at.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) });
  }
  return call("Date", parts);
}
