# Grounding layers

The first import slice from `research/seed-dataset-sources.md`, read with its corrections:
NGSL core words, Open English WordNet top sense only, ConceptNet functional relations.

| Layer file | Source | License | Adds |
|---|---|---|---|
| `ngsl.json` | NGSL 1.2 | CC BY-SA 4.0 | `Named("word")` for each core word |
| `oewn.json` | Open English WordNet 2024 | CC BY 4.0 | `PartOfSpeech(...)` in `Lexical()`, and from the top sense: `IsA`, `PartOf` / `HasPart`, `AntonymOf`, `SameAs(Cili(...))` |
| `conceptnet.json` | ConceptNet 5.7.0 | CC BY-SA 4.0 | `UsedFor`, `CapableOf`, `Causes` |

## Run

From `packages/concept-runtime`:

```sh
sh src/seed/grounding/fetch.sh              # downloads ~511 MB into data/grounding/dumps
pnpm build && node dist/seed/grounding/build.js   # writes data/grounding/layers/*.json
node dist/cli.js --ground                   # grounds ~/.napkin/graph.json and saves it
```

`data/` is gitignored: dumps and layers are generated, and the share-alike ones should not
be committed into the CC BY core. `--ground <dir>` grounds from another directory.

## Where layers go

A layer is loaded on request (`--ground`), not by `seed()`: it is thousands of Concepts
under licenses you choose to take on. Once grounded it persists in the graph like anything
else, and grounding again is a no-op.

Inside the graph the layers stay separable by stamp. Grounding records one import stamp per
layer, on `Imported(version=, license=, url=)` in the source's Concept (`Ngsl`,
`OpenEnglishWordNet`, `ConceptNet`), and every relation that layer adds is stamped with that
stamp as its `source`. The share-alike part of a graph is exactly the relations sourced from
the `Ngsl` and `ConceptNet` import stamps.

## Collisions

Words are named the way `ears/parser/names.ts` names phrases (`nameOf`), so an imported word
and a Concept the system already has are the same Concept. Grounding adds only what is not
already held. The one thing it will not add is an `IsA` onto a Concept that already has
realizations, since a new ancestor can change what that Concept runs; those are withheld and
printed, for a person to assert or not.

## Not here, on purpose

WordNet synonymy (rebuilds the `Identity` / `Chore` collapse), senses past the first,
open-ended ConceptNet relations, multi-word objects, MASSIVE (an Ears eval corpus, not
vocabulary), BabelNet and Oxford lists (licenses). The parser does not read `PartOfSpeech`
yet; that is reading-spec R14.
