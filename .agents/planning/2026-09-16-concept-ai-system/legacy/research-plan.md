# Research plan and scope

**Status:** Research and authorized prior-version audit complete; the user approved moving to detailed design on September 16, 2026.

## Topics

The user approved research into:

1. Concept-centered interpreters and intermediate representations.
2. Local Ollama model capabilities and model choices.
3. macOS-local storage and Concept lookup.
4. macOS sandbox options for later autonomous file and command access.
5. Evidence and statistics for selecting among coexisting realizations.
6. Read-only architecture and implementation audit of `/Users/kealjones/Git/Personal/soup`, `/Users/kealjones/Git/Personal/spoon`, and `/Users/kealjones/Git/Personal/spoon_old copy`, after the user explicitly authorized review.

## Scope steering

The first implementation may defer both the always-running Exist loop and the sandboxed system-action environment until the Concept framework can demonstrate useful thinking on its own. Keep both in the long-term architecture and implementation plan; do not make them prerequisites for the initial Concept loop.

The first version is local to the user's Mac. Start with Ollama models and make model providers swappable through Concepts and realizations.

## Source and project constraints

- Prefer official documentation and primary research papers.
- The prior projects were initially off limits; the user later explicitly authorized review of only the three named repositories. Their source was not modified.
- Available search tools include web search and GitHub search. Web search and public primary sources were used; GitHub search of the official Hyperon implementation returned no useful matches.
- User input/answers are tracked in the parent [idea-honing.md](../idea-honing.md).
