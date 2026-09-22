# Initial architecture options

This was the research-phase synthesis. The resulting design and its implementation choices are documented in [detailed-design.md](../design/detailed-design.md); use that document if this exploratory note differs.

## Concept relationships

```mermaid
flowchart LR
    Concept["Concept<br/>identity + relations + description/gloss"]
    Realizations["Owned realizations<br/>context + composed body and/or host operation"]
    Inputs["Composed Concept inputs"]
    Relations["Related Concepts"]
    Context["Usage context"]
    Evidence["Usage/outcome evidence"]
    Concept --> Realizations
    Concept --> Relations
    Realizations --> Inputs
    Context --> Realizations
    Evidence --> Context
    Evidence --> Realizations
```

The diagram intentionally avoids a separate rule registry. A realization is contained by its Concept and its composed body uses the same Concept form as all other meanings and actions. The runtime's only out-of-network role is a generic loader/evaluator and minimal host bridge.

## User prompt to answer data flow

```mermaid
flowchart TD
    Raw["Original prompt + exact source spans"]
    Parse["PromptInput Concept"]
    Direct["Direct Concept-expression realization"]
    Local["Ollama local-model realization"]
    Graph["Conceptual prompt graph<br/>wording, corrections, misspellings, PromptVariables"]
    Memory["Lookup Concepts<br/>relevant persistent conversation/data"]
    Resolve["Context and realization selection Concepts"]
    Learn["Search/research Concepts"]
    Teacher["AskTeacher Concept<br/>larger local model"]
    Eval["Generic Concept evaluator"]
    Result["Answer/result Concept"]
    Render["Language realization"]
    User["Chat response"]
    Trace["Live + durable trace store"]

    Raw --> Parse
    Parse --> Direct
    Parse --> Local
    Direct --> Graph
    Local --> Graph
    Graph --> Memory
    Memory --> Resolve
    Resolve -->|known realization| Eval
    Resolve -->|gap| Learn
    Learn -->|still missing| Teacher
    Teacher --> Resolve
    Eval --> Result
    Result --> Render
    Render --> User
    Parse -. events .-> Trace
    Graph -. events .-> Trace
    Resolve -. events .-> Trace
    Learn -. events .-> Trace
    Teacher -. events .-> Trace
    Eval -. events .-> Trace
    Render -. events .-> Trace
```

## First-stage versus later-stage scope

```mermaid
flowchart TB
    subgraph First["First demonstrable framework"]
      In["PromptInput: DSL and local-model realizations"]
      Core["Concept lookup + composition + evaluation"]
      Out["Answer Concept + natural-language realization"]
      Trace["Live/history trace"]
      In --> Core --> Out
      In -.-> Trace
      Core -.-> Trace
      Out -.-> Trace
    end
    subgraph Later["Later autonomy and host-effect phase"]
      Exist["Exist Concept / continuous scheduler"]
      Learn["Autonomous research + Concept growth"]
      Exec["File, network, shell, external-program Concepts"]
      Isolation["Dedicated sandbox / OS-level isolation"]
      Exist --> Learn --> Exec
      Exec --> Isolation
    end
    Core --> Later
```

The user explicitly allowed deferring the latter stage until the Concept framework demonstrates useful thinking. Specific sandbox technology and criteria for enabling continuous activity remain open.
