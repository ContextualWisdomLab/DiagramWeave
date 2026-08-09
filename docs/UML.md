# DiagramWeave UML and Runtime Views

**Status:** Accepted diagrams for protected-main foundations and explicitly labelled future/active-PR boundaries.  
**Last reviewed:** 2026-08-09

## Component view

```mermaid
flowchart LR
    USER[User / host]
    CORE[Core trust kernel]
    ORCH[Contextual Orchestrator adapter]
    CO[Contextual Orchestrator]
    RENDER[PlantUML renderer]
    CLI[CLI]
    LSP[Language Server]
    STDIO[stdio adapter]
    HOSTS[naruon / IDE / CI hosts]

    USER --> CORE
    USER --> CLI
    HOSTS --> CORE
    HOSTS --> ORCH
    HOSTS --> LSP
    ORCH --> CO
    CLI --> RENDER
    LSP --> RENDER
    STDIO --> LSP
```

## Proposal lifecycle sequence

```mermaid
sequenceDiagram
    actor User
    participant Host
    participant Adapter as Orchestrator Adapter
    participant Core

    User->>Host: instruction + selected source/range
    Host->>Adapter: explicit bounded context
    Adapter->>Adapter: validate endpoint/model/limits
    Adapter->>Adapter: request external proposal
    Adapter-->>Core: strict parsed proposal
    Core->>Core: validate schema + exact base revision + ranges
    Core-->>Host: immutable proposal
    Host->>User: diff / preview
    alt user accepts
        Host->>Core: apply against current exact source
        Core-->>Host: next source + before/after hashes
    else reject
        Host-->>User: source unchanged
    end
```

## Renderer sequence

```mermaid
sequenceDiagram
    actor Host
    participant Renderer
    participant PlantUML as local PlantUML child
    participant Diagnostic as diagnostic sanitizer

    Host->>Renderer: source + format + absolute Java/JAR paths
    Renderer->>Renderer: enforce source/timeout/output limits
    Renderer->>PlantUML: stdin only; SANDBOX; empty environment
    PlantUML-->>Renderer: stdout + bounded standard report
    alt valid artifact
        Renderer->>Renderer: validate SVG/PNG structure
        Renderer-->>Host: immutable artifact + source hash
    else syntax/report failure
        Renderer->>Diagnostic: parse bounded report
        Diagnostic-->>Renderer: fixed-message frozen diagnostic
        Renderer-->>Host: safe error/diagnostic
    end
```

## Language Server layer view

```mermaid
flowchart TB
    BASE[diagnostic lifecycle/session]
    SYMBOL[authoritative document-symbol tree]
    COMPLETION[declaration completion]
    FOLD[folding ranges]
    HOVER[declaration hover]
    DEF[same-document definition]
    FUTURE[references — PR #22 active-PR]

    BASE --> SYMBOL
    SYMBOL --> COMPLETION
    SYMBOL --> FOLD
    SYMBOL --> HOVER
    SYMBOL --> DEF
    SYMBOL -. future reuse .-> FUTURE
```

Every feature reuses accepted source snapshots and the same structural evidence. No outer feature gets authority to parse includes/macros/remotely rendered semantics independently.

## Accepted-document state machine

```mermaid
stateDiagram-v2
    [*] --> uninitialized
    uninitialized --> initialized: initialize accepted
    initialized --> ready: initialized notification
    ready --> open_snapshot: didOpen accepted
    open_snapshot --> open_snapshot: newer didChange accepted
    open_snapshot --> ready: didClose accepted
    ready --> shutting_down: shutdown
    open_snapshot --> shutting_down: shutdown
    shutting_down --> exited: exit
    exited --> [*]
```

A stale asynchronous completion may not transition a later snapshot back to an older generation/version.

## Studio boundary — future host

```mermaid
flowchart LR
    STUDIO[DiagramWeave Studio — future]
    FILE[Host file/save authority]
    CORE[Core]
    LSP[LSP package]
    RENDER[Renderer]
    ORCH[Optional Orchestrator adapter]

    STUDIO --> FILE
    STUDIO --> CORE
    STUDIO --> LSP
    STUDIO --> RENDER
    STUDIO --> ORCH
```

Studio owns visible editor state, focus, accessibility, user approval, file save/recovery, and optional account/persistence behavior. Foundation packages do not silently acquire those responsibilities.

## Autonomous-development authority flow

```mermaid
flowchart LR
    MODEL[OpenCode / model process]
    VERIFY[credential-free verification]
    PUBLISH[bounded trusted publication]
    REVIEW[independent review/security]
    MAIN[protected main]

    MODEL -->|bounded patch| VERIFY
    VERIFY --> PUBLISH
    PUBLISH -->|ordinary PR/branch update only| REVIEW
    REVIEW -->|all gates satisfied| MAIN
```

PR #24 changes the repository's hourly governance workflow and remains active-PR until merged.

## Diagram maintenance rule

Update this file when package ownership, public lifecycle, trust/authority boundary, protocol surface, or deployment topology changes. Active-PR and future-host items must not be relabelled as as-built until protected-main integration is proven.