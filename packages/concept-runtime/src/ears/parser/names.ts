/**
 * The name a written form is known by: "cover letter" is `CoverLetter`. Shared by the
 * Wikidata research and the grounding import, so a word the import seeded and a phrase
 * research met land on one Concept rather than two spellings of it.
 *
 * The parser does not use it. It reads "cover letter" as said, `Letter(Cover())`, whatever
 * the graph knows, and a graph that holds `CoverLetter` reads the phrase as it through the
 * name's fold (`Read`, src/seed/seed.ts). Reading once looked phrases up on Wikidata and
 * minted a Concept from the first exact label: "ice cream" became a Blackpink single.
 */
export const nameOf = (written: string): string =>
  written
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
