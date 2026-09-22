# Local models, Concept lookup, and local persistence

## Ollama findings

Ollama exposes a local chat API and a JavaScript client. It supports schema-constrained JSON output through its chat API, with a JavaScript example that parses the returned JSON. This can make the local parser's output structurally checkable before the Concept evaluator sees it. A schema constrains shape; the runtime still needs to check concept references, source-span coverage, argument arity/types, and whether the proposed composition is valid for the original utterance. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [tool calling](https://docs.ollama.com/capabilities/tool-calling), and [streaming](https://docs.ollama.com/api/streaming).

Ollama also supports model-driven tool calls. For this project, that is a capability to avoid using as the orchestration path: if the model directly invokes a separate tool registry, the model becomes a second action engine. Instead, expose the Ollama call itself as a Concept realization; have it return a Concept representation; then let the Concept runtime validate and evaluate that representation. This keeps the distinction between model suggestion and system action explicit and traceable.

The current [Ollama model library](https://ollama.com/library/qwen3) lists qwen3:30b at about 19 GB with a 256K context variant. The [Qwen 3.5 model page](https://ollama.com/library/qwen3.5) currently lists 27B and 35B variants as well. These are listed model sizes, not sufficient evidence that a particular variant will fit comfortably in the user's Mac's unified memory at a useful context length. Exact parser and Teacher choices should be benchmarked on the target Mac with the project's own examples.

Use at least two swappable model-call realizations:

- A smaller local model for PromptInput conversion and natural-language rendering.
- A larger local model behind AskTeacher for unresolved Concept gaps.

The model identifiers and API provider belong in realization data/arguments so that a later provider can be added without changing the Concept architecture.

## Concept lookup and local storage

SQLite is a plausible first local persistence layer because its official [FTS5 documentation](https://www.sqlite.org/fts5.html) supports indexed full-text search with phrase, prefix, proximity, Boolean, and relevance-ranked queries. SQLite's [recursive CTEs](https://sqlite.org/lang_with.html) can traverse relationships encoded as rows. This is enough to begin with local Concept lookup by name and plain-English gloss plus graph navigation, without introducing a separate hosted graph service.

This is an implementation inference, not a user requirement: use FTS5 as an index/projection over Concept names and searchable descriptions, not as semantic truth. The Concept-level Lookup operation can retrieve a short relevant set and then traverse relations and realizations. Embedding search can be a later, swappable Lookup realization through a local embedding model; it should not become a second memory system.

## Implications for the first proof

A useful end-to-end slice can accept either:
1. A Concept-expression string handled by a direct PromptInput realization; or
2. Ordinary language handled by the local-model PromptInput realization.

Both routes should enter the same Concept graph and evaluator, produce a result Concept such as Answer(15), and render that Concept for the user. The prompt parser should preserve original words and spelling as source-backed values, while adding separate interpretations such as Misspelling("virginya", "Virginia"). The trace must show which realization performed each transformation.

## Open questions

- Which model size meets latency and fidelity needs on the user's actual Mac?
- How should structured outputs encode source spans, corrections, prompt variables, fuzzy references, and unresolved Concept names?
- Which search ranking should combine name, description, relations, prior usage, and perhaps embeddings?
- How should the Concept serialization format stay portable for a later Rust implementation?

## Sources

- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama streaming](https://docs.ollama.com/api/streaming)
- [Ollama Qwen3 model library](https://ollama.com/library/qwen3)
- [Ollama Qwen3.5 model library](https://ollama.com/library/qwen3.5)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [SQLite recursive CTEs](https://sqlite.org/lang_with.html)

