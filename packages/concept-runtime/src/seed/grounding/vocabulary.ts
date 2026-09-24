/**
 * The relation vocabulary the grounding layers write, seeded so a grounded graph describes
 * itself (concept-spec Part 5.3): the properties the relations have are relations on them.
 *
 * Seeded whether or not any layer is grounded, because it is ordinary vocabulary and costs a
 * handful of Concepts. The layers themselves are data and are loaded on request.
 */
import { concept, type ConceptUnit } from "../../concept/unit.js";

const rel = (identity: string, ...more: string[]) => concept(identity, { relations: ["IsA(Relation())", ...more] });

export const groundingVocabulary: readonly ConceptUnit[] = [
  // Stored on the part; the whole's HasPart is derived, not written twice.
  rel("PartOf", "InverseOf(HasPart())"),
  rel("HasPart"),
  rel("AntonymOf", "Symmetric()", "Irreflexive()"),
  rel("UsedFor"),
  rel("CapableOf"),
  rel("Causes"),
  rel("SameAs"),
  // Kind to kind: everything that is one is also the other, so it chains (research/wikidata.ts).
  rel("SubclassOf", "Transitive()", "Enduring()"),
  rel("Named"),
  // Scoped to Lexical(): a fact about the word, read by reading-spec R14 when it lands.
  rel("PartOfSpeech"),
  concept("WordClass", { relations: ["IsA(Category())"] }),
  ...["Noun", "Verb", "Adjective", "Adverb"].map((w) => concept(w, { relations: ["IsA(WordClass())"] })),
  // The import stamp of each layer is an Imported relation on its source.
  rel("Imported"),
  ...["Ngsl", "OpenEnglishWordNet", "ConceptNet", "Cili"].map((s) => concept(s, { relations: ["IsA(Source())"] })),
];
