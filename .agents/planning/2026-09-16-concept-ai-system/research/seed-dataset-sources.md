Status: research input, not a spec. Moved here 2026-09-22. Read with these corrections,
which reconcile it with `design/concept-spec.md` and `design/judgment-research.md`:

1. Identity is the name (`concept-spec.md` Part 3, `memory-spec.md` Part 3.1). A CILI or
   Wikidata ID is a relation on the Concept, for example `SameAs(Wikidata("Q..."))`, never
   the identity. Units have no fields, so `primitive: true` becomes `IsA(Prime())`.
2. WordNet synonymy is per sense and Napkin names are per word. Importing `SynonymOf`
   between words recreates the `Identity` / `Chore` collapse (`design/README.md`,
   divergence table). Hypernyms of polysemous words give one name several `IsA` parents,
   which confuses ordering by inheritance distance. Import the top sense only, or import as
   contextual relations gated by the 45 WordNet supersenses used as facets
   (`judgment-research.md` Part 14).
3. Relation types: import small closed families only (`judgment-research.md` Part 6):
   taxonomy (`IsA`), part and whole with its inverse, antonymy, and the functional relations
   `UsedFor`, `CapableOf`, `Causes`. Skip open-ended ones such as `RelatedTo`.
4. The functional ConceptNet relations are the grounding `judgment-research.md` Part 9.5
   says is missing (knowing what money does), so they belong in the first slice, not
   Stage 2. WordNet taxonomy alone does not ground.
5. MASSIVE and the other intent datasets are not seed vocabulary. Intent labels such as
   `alarm_set` fold a phrase into one name, which the Ears contract forbids (`ir-spec.md`
   Part 9). Use them as an Ears evaluation corpus instead: 1M labelled utterances in 51
   languages.
6. Pipeline step 6 ("map utterances onto the seeded inventory") applies to the Teacher
   only. The Ears invents names and is never shown the graph (`ir-spec.md` Part 8.1,
   `packages/concept-runtime/src/ears/AGENTS.md`).
7. License: CC BY-SA sources (NGSL, ConceptNet) stay in a separable layer, as the doc
   already says.

---

# Building a Principled Seed Dataset for Napkin: A Layered Plan from Cross-Linguistic Primitives to Intent Frames

## TL;DR
- Build the seed in four layers using permissively licensed sources only: (1) a ~65–130-item **primitive layer** from NSM primes + molecules and Swadesh/Concepticon; (2) a **~2,800–5,000 frequency-ranked core-vocabulary layer** (NGSL, CC BY-SA) cross-linked to language-neutral IDs (Wikidata Q-items/lexemes CC0, CILI/Open English WordNet); (3) a **relation layer** (IsA/SynonymOf/PartOf) imported from Open English WordNet (CC BY 4.0) and filtered ConceptNet (CC BY-SA); (4) an **intent/frame layer** seeded from MASSIVE (CC BY 4.0, 60 intents) and ISO 24617-2 dialogue acts, extending Napkin's `What`/`Do`/`Show` frames.
- **Avoid BabelNet as an importable source** — it is non-commercial (CC BY-NC-SA 3.0) and cannot be redistributed in a product. WordNet's fine-grained senses (120,630 synsets, e.g. 41 senses for "run") will cause sense explosion; collapse to WordNet's 45 lexicographer-file "supersenses" or coarse clusters, or gate senses by frequency.
- Recommended first-tier scope: **on the order of 5,000 concept nodes** (primes + molecules + NGSL core, each tied to a CILI/Wikidata ID), **~30–40 canonical relation types**, and **~60–120 intent frames** — enough to cover ~90%+ of general text tokens and the bulk of assistant-style commands, while staying small enough to curate and to keep the LLM parser's residuals meaningful.

## Key Findings

**On the English-naming problem (central to Napkin's design):** There are two established schools. Wikidata and CILI use **opaque numeric IDs with multilingual labels** (e.g. Wikidata Q-items, CILI `i77784`), so concept identity is language-neutral and English is just one label among many. Grammatical Framework (GF) and NSM instead use **English-named abstract keys** (GF's abstract syntax is explicitly "an interlingual representation" from which each language is a "concrete syntax," but its function names are English-like). For Napkin — where the LLM parser emits names directly — the pragmatic answer is a **hybrid**: keep human-readable English names as the primary developer-facing key (so `Multiply`, `What` stay legible and the LLM can emit them), but attach a stable opaque ID (a CILI ID or Wikidata Q-id) as an immutable attribute on every canonical Concept. This lets you (a) attach per-language surface labels, (b) rename the English key without breaking identity, and (c) link outward to other resources. CILI's design rule is instructive: from the CILI paper (Bond et al. 2016), "ILI IDs should be persistent: we never delete, only deprecate or supercede; we should not change the meaning of the concept."

**Primitive layer candidates:**
- **NSM semantic primes**: **65 primes** — the current, stable count. Per Wierzbicka (2021, *Russian Journal of Linguistics* 25(2):317–342), "the table with 65 elements has now been stable for many years," tested "in over 30 languages"; the inventory grew from the original 14 primes (Wierzbicka 1972) to 60 (Goddard & Wierzbicka 2002) to today's 65. Add ~50 "semantic molecules" (man, woman, water, etc.). This is the best-validated cross-linguistic primitive set and is small enough to hand-curate. Primes are claimed universal and indefinable, so they are the natural bottom of a decomposition hierarchy. There is no single machine-readable licensed dump; the tables must be transcribed from published work (the word lists are facts, not copyrightable).
- **Swadesh / Leipzig–Jakarta lists**: Swadesh 100/207; Leipzig–Jakarta 100 (empirically derived from the World Loanword Database across 41 languages, ranked by borrowing resistance). Good for "culturally-independent" basic concepts.
- **Concepticon (CLLD)**: the aggregator to use. Current version **3.4.0** (released 25 Feb 2025). It links **413 concept lists** to roughly **3,900–4,000 unified concept sets** (the v3.0.0 CLDF metadata reports **3,964 concept sets** and **413 concept lists**; live counts at concepticon.clld.org are equal or slightly higher since releases only grow). Licensed **CC BY 4.0**; bulk-downloadable via GitHub (`concepticon/concepticon-data`, `concepticon-cldf`), archived on Zenodo, with a `pyconcepticon` Python API. This is the cleanest way to get Swadesh/Leipzig-Jakarta with ready-made cross-linguistic concept IDs.

**Core lexical/concept graphs (with sizes, relations, licenses):**
- **Open English WordNet (2024 Edition, released 1 November 2024)**: **161,705 words, 120,630 synsets, 418,168 word-sense pairs**; licensed **CC BY 4.0** (also described as BSD-like at Princeton); relations map cleanly to Napkin (hypernym→`IsA`, synonymy→`SynonymOf`, meronym→`PartOf`). Provides CILI IDs for cross-language linking. **Fully importable.** (For scale, the classic Princeton WordNet 3.0 has ~117,000 synsets.)
- **Open Multilingual Wordnet / CILI**: OMW links dozens of wordnets to Princeton WordNet via CILI (the extended OMW covers 150+ languages with an estimated 94% accuracy; 26 languages have >10,000 synsets each, >1.4M words total). CILI is **CC BY 4.0** and is the interlingual index — a flat list of concepts with persistent IDs. This is the cross-lingual backbone. Mapping loss between WordNet versions via CILI is negligible (≤0.21%).
- **ConceptNet 5.7**: a network whose full edge dump is tens of millions of assertions, built on **36 core relations** (IsA, UsedFor, CapableOf, PartOf, Synonym, RelatedTo, Causes, HasPrerequisite, AtLocation, MannerOf, etc.) across many languages; **CC BY-SA 4.0**. Rich common-sense relations but noisier (crowdsourced + Wiktionary-derived). Importable with attribution + share-alike.
- **Wikidata items + lexemes**: all **CC0** (public domain) — the most permissive. Lexemes (L-ids), senses (S-ids), forms (F-ids); >250k lexemes across 668+ languages; items give language-neutral Q-ids with multilingual labels. **Ideal for the opaque-ID + multilingual-label backbone.** (Note: Wiktionary itself is CC BY-SA, but Wikidata's lexeme namespace is CC0.)
- **BabelNet 5.3**: ~23M entries, 600 languages — but **CC BY-NC-SA 3.0 (non-commercial, research institutions only)**. Flag clearly: cannot be used in a commercial product or redistributed. Use only for research/inspiration.
- **FrameNet**: ~1,200 frames (1,222 in release 1.7), ~13,500 lexical units, 200,751 annotated sentences; frames are cross-linguistically stable (Buyer/Seller/Goods). Multilingual FrameNets exist (Spanish, German, Japanese, Korean, Portuguese, Chinese, Swedish). Good model for Napkin's Frame layer.
- **PropBank**: ~5,600 framesets, verb-centric rolesets (ARG0–5); the "unified" roleset lexicon underlies both AMR and UMR.
- **VerbNet**: ~4,500 verbs in classes with thematic roles, selectional restrictions, and syntactic frames.

**Frequency & coverage (diminishing returns):**
- Per the NGSL project's own corpus analysis, the top 10 words ≈ 25% of tokens and the top 100 ≈ ~50% of tokens. The **NGSL 1.2 (2,809 lemmas) gives ~92% coverage** of general English: per newgeneralservicelist.com, "it gives an average of 92% coverage of most texts of general English and even higher coverage in other situations (93% coverage for Harry Potter, 94% coverage for TOEIC exams, and 95% coverage for many TV shows such as Friends)."
- Per Nation (2006), "How Large a Vocabulary Is Needed For Reading and Listening?" (*Canadian Modern Language Review* 63.1:59): at 98% coverage, "a 8,000 to 9,000 word-family vocabulary is needed for comprehension of written text and a vocabulary of 6,000 to 7,000 for spoken text"; ~95% (the minimal comprehension threshold) needs roughly 4,000–5,000 word families (≈3,000 including proper nouns for spoken English). This is the empirical case for a first tier in the low thousands and a hard stop before the long tail.
- **NGSL** (2,809 words) — **CC BY-SA 4.0**, free including commercial use with attribution (use the current official domain newgeneralservicelist.com; the old `.org` domain is no longer authorized). **Oxford 3000/5000** — **proprietary to Oxford University Press, no Creative Commons license; do not bulk-import** (reuse requires OUP permission). **SUBTLEX-US** — freely downloadable frequency data (Brysbaert & New 2009); OSF lists license as "Other," and the wordfreq author documents direct permission from Brysbaert to redistribute "for any purpose … similar to the Creative Commons Attribution-ShareAlike license." **Longman Defining Vocabulary** (~2,000–2,200 words; one edition lists 2,197 words + 10 prefixes + 39 suffixes) and **Ogden's Basic English** (850 words) are classic small defining vocabularies useful as a decomposition target set.

**Communicative intents / speech acts:**
- **Searle's 5 speech-act classes** (assertives/representatives, directives, commissives, expressives, declarations) — the theoretical backbone for top-level Frames.
- **ISO 24617-2** (DiAML): a standard defining communicative functions organized in multiple dimensions, hierarchically, with a formal XML semantics — directly usable as a principled intent taxonomy. **DAMSL/SWBD-DAMSL**: ~42 dialogue-act tags (Statement-non-opinion 36%, Acknowledgement 19%, Statement-opinion 13%, Yes-No-Question, Agreement, etc.).
- Task-intent datasets: **MASSIVE** — per FitzGerald et al. (2023, ACL), it "contains 1M realistic, parallel, labeled virtual assistant utterances spanning 51 languages, 18 domains, 60 intents, and 55 slots … created by tasking professional translators to localize the English-only SLURP dataset into 50 typologically diverse languages from 29 genera"; **CC BY 4.0 — importable and multilingual**. Also **CLINC150** (150 intents/10 domains, 22,500 utterances), **SNIPS** (7 intents, ~14k utterances), **ATIS** (~21 intents, flights, ~5k utterances), **Banking77** (77 intents), **HWU64** (64 intents/21 domains). These map onto Napkin's `Do(...)` frames as concrete command intents.

**Meaning-representation formalisms resembling Napkin's IR:**
- **AMR**: rooted directed acyclic graphs; nodes are sense-disambiguated concepts (PropBank rolesets like `want-01`), edges are roles (ARG0/ARG1). English-centric.
- **UMR**: cross-lingual extension of AMR — replaces AMR's "fixed English-centric rolesets" with a lattice-style schema annotators adapt per language; adds aspect, modality, and document-level (coreference, temporal, modal) relations. Directly relevant: it is the state of the art in "keep a language-neutral core with per-language extensions," and it explicitly separates "the language-independent from the language-specific."
- **Grammatical Framework**: abstract syntax as interlingua; the Resource Grammar Library covers 40+ languages from one shared abstract syntax; the exact "English-named abstract layer with per-language concrete syntaxes" pattern Napkin faces. Ranta et al. (2020) note the abstract syntax "offers a unified view on … Universal Dependencies, WordNets, FrameNets, Construction Grammars, and Abstract Meaning Representations."
- **UCCA, Universal Dependencies**: cross-lingual annotation layers (foundational structure, not concept inventories).
- **Cyc/OpenCyc**: OpenCyc 4.0 (2012) had 239,000 concepts and 2,093,000 (mainly taxonomic) facts, but was **shut down ~March 2017**; full Cyc is commercial. **SUMO**: upper ontology with formal first-order axioms, mapped across all of WordNet 3.0 via equivalence/subsumption/instance relations — freely licensed, good for a formal top ontology if desired.

## Details

### Layer 1 — Primitive layer (decomposition floor)
Seed with the **65 NSM primes + ~50 molecules** (≈115 items), each as a canonical Concept flagged `primitive: true`. Add the **Leipzig–Jakarta 100** and **Swadesh 100** via Concepticon concept-set IDs (CC BY 4.0) to get culturally-neutral basic concepts with ready-made cross-linguistic mappings. Rationale: NSM primes give you a principled, universally-lexicalized base into which all other Concepts can (in principle) decompose — the same role `Plus`/`Do`/`Happen` already implicitly play in Napkin. Keep this layer tiny and hand-curated; it is the semantic bedrock and the thing you most want language-independent.

### Layer 2 — Core frequency-ranked vocabulary with cross-lingual IDs
Import the **NGSL 2,809 lemmas** (CC BY-SA) as the frequency spine, then extend toward ~5,000 by merging with WordNet core senses. For every entry, attach: (a) the English name (developer key + what the LLM emits), (b) a **CILI ID** (from Open English WordNet) and/or a **Wikidata Q-id/L-id** (CC0) as the immutable language-neutral identity, (c) part of speech, (d) frequency rank. This is where the "English-naming problem" is solved structurally: the name is a convenience label; identity lives in the opaque ID, and multilingual labels hang off it. Stop around the 5k mark — past ~6–9k word families you are chasing the ~2% long tail (Nation 2006) that Napkin's Teacher/residual mechanism is better suited to fill on demand.

### Layer 3 — Relations
Import relations for the seeded nodes only (not the whole graph):
- From **Open English WordNet**: hypernym→`IsA`, synonyms→`SynonymOf`, meronym/holonym→`PartOf`/`HasPart`, antonym→`Antonym`, derivation→morphosemantic links.
- From **ConceptNet 5.7** (CC BY-SA, filtered to your seeded English nodes): `UsedFor`, `CapableOf`, `Causes`, `HasPrerequisite`, `AtLocation`, `MannerOf` — the common-sense relations WordNet lacks.
- Normalize both into Napkin's ~30–40 canonical relation types. Context-scoped synonyms (the `GoesInto` vs `DividedBy` operand-order case) should be modeled as `SynonymOf` with a context qualifier, mirroring ConceptNet's `HasContext` relation and FrameNet's frame-scoping.

### Layer 4 — Intent / Frame layer
Structure top-level frames on **Searle's five classes** and **ISO 24617-2** dimensions, then populate concrete command intents from **MASSIVE's 60 intents** (CC BY 4.0, already parallel across 51 languages — so your `Do(...)` frames inherit multilingual grounding for free). Map: questions→`What(...)`/`Ask`; commands→`Do(...)`; `Show`, `Steps` etc. become directive sub-frames. DAMSL/SWBD-DAMSL supply conversational acts (Acknowledge, Agree, Greeting, Yes-No-Question) if you want dialogue-level coverage. Keep frames language-neutral (opaque-ID backed) with per-language trigger patterns.

### Pipeline & pitfalls
1. **Start from the ID backbone**: ingest Wikidata (CC0) + Open English WordNet/CILI first; these give you stable IDs and multilingual labels to hang everything else on.
2. **Frequency-gate**: rank by SUBTLEX/NGSL frequency; import senses top-down until coverage plateaus (~5k).
3. **Fight sense explosion**: WordNet lists 41 senses for the verb "run"; collapse to WordNet's **45 lexicographer files ("supersenses")** — per Princeton's `lexnames(5WN)`, "synsets are organized into forty-five lexicographer files based on syntactic category and logical groupings" (26 noun + 15 verb categories plus adjective/adverb classes) — or import only the top 1–2 frequency-ranked senses per lemma, letting the Teacher add rare senses as residuals. This is the single biggest documented failure mode when importing WordNet into reasoning systems; coarsening is itself an unsolved research problem, especially for verbs.
4. **Deduplicate across sources** via CILI/Wikidata IDs (OMW's "defkey" hashing is a model — 40-char hexadecimal hashes of language+headword+POS+gloss).
5. **License hygiene**: keep CC0 (Wikidata), CC BY (Open English WordNet, CILI, Concepticon, MASSIVE) importable; isolate CC BY-SA (ConceptNet, NGSL) because share-alike is viral; **exclude BabelNet (NC) and Oxford 3000/5000 (proprietary) entirely** from redistributable data.
6. **LLM-assisted generation constrained by inventories**: rather than free-form generation, prompt the Teacher/Ears LLM to map utterances onto the seeded inventory (NGSL words, MASSIVE intents, NSM primes), which controls hallucination and keeps names consistent with the graph.

## Recommendations

**Stage 1 (first tier, ~5k nodes):** NSM primes+molecules (~115) + Leipzig-Jakarta/Swadesh via Concepticon + NGSL 2,809 + WordNet core senses to ~5,000, each with CILI + Wikidata IDs and an English name. Import IsA/SynonymOf/PartOf from Open English WordNet for these nodes. Seed ~60 intents from MASSIVE into `Do`/`What` frames. This covers ~90%+ of general-text tokens (NGSL alone gives ~92%) and most assistant commands. **Benchmark to advance:** measure the residual rate on a sample of real utterances; if <10% of content words hit residuals, expand.

**Stage 2:** Add ConceptNet common-sense relations (filtered), expand vocabulary toward 8–10k **only where residual telemetry shows demand** (this is the 95%→98% coverage jump that Nation shows costs thousands of extra word families for a couple of percent), add DAMSL dialogue acts and SUMO upper-ontology links if formal reasoning is needed. **Threshold:** expand a domain only when its residual rate exceeds your target for that domain.

**Stage 3:** Multilingual surface realization — attach per-language labels from OMW/Wikidata lexemes to existing IDs; do NOT create new nodes per language. Study UMR and GF patterns for keeping the concept layer language-neutral with per-language concrete realizations.

**Do first, cheaply:** the ID-backbone + NGSL + MASSIVE import is a few days of scripting against permissive dumps and yields the highest coverage per unit effort. The primitive (NSM) layer is small but must be transcribed by hand; do it once, carefully.

## Caveats
- NSM primes and molecules have no clean licensed machine-readable dump; transcribe from published tables (the word lists are facts, not copyrightable, but cite Goddard & Wierzbicka, and note the 65-prime count is a theoretical claim, not an empirically closed set — some linguists dispute universality).
- NGSL and ConceptNet are share-alike (CC BY-SA); if Napkin's seed is redistributed, derived data inherits share-alike. Keep these in a separable layer so the CC0/CC BY core stays unencumbered.
- BabelNet (CC BY-NC-SA 3.0) and Oxford 3000/5000 (proprietary OUP) must not enter redistributable seed data. SUBTLEX is freely usable but its commercial-reuse permission is documented via author correspondence rather than a posted formal license — cite the authors.
- WordNet sense granularity is the main import hazard; treat sense-clustering as an ongoing curation task, not a one-time script.
- "Coverage" figures are in word families and drawn from written/spoken corpora (Cambridge English Corpus, BNC, Wellington) that may not match Napkin's actual traffic; validate against real utterances before freezing tier sizes.
- Some figures vary by version: Concepticon's exact concept-set count (3,964 is the v3.0.0 CLDF figure; live 3.4.0 is slightly higher), OMW per-language sizes, and FrameNet counts all move between releases — verify against the specific release you import, and pin a checksum/version (as ConceptNet importers do) so the build is reproducible.