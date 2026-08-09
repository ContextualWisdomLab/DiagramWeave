# DiagramWeave Architecture Decision Record Index

The status inside each ADR is authoritative. `Accepted` means the decision governs architecture; it does not imply a future host or active-PR feature is already implemented.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-source-authority.md) | Source text and exact revision are authoritative | Accepted |
| [0002](0002-model-proposals.md) | Model output is an untrusted proposal, never implicit mutation | Accepted |
| [0003](0003-renderer-isolation.md) | Renderer is local, stdin-only, sandboxed, bounded, and source-minimizing | Accepted |
| [0004](0004-authoritative-symbol-tree.md) | Editor intelligence reuses one authoritative conservative symbol tree | Accepted |
| [0005](0005-transport-neutral-lsp.md) | LSP feature semantics are transport-neutral; stdio owns framing only | Accepted |
| [0006](0006-provider-neutral-orchestrator.md) | Model access stays behind an optional Contextual Orchestrator adapter | Accepted |
| [0007](0007-automation-authority.md) | Autonomous development is separated from review/merge/release authority | Accepted |

## Status vocabulary

- `Proposed` — under review.
- `Accepted` — governing decision.
- `Deprecated` — retained for compatibility but not preferred.
- `Superseded` — replaced by a named later ADR.
- `Rejected` — evaluated and intentionally not adopted.

## ADR triggers

Create or update an ADR for changes to source authority, proposal application, renderer capability/isolation, editor structural authority, transport ownership, persistence, provider/model boundary, filesystem authority, autonomous credentials, or release authority.

Implementation PRs should cite the governing ADR and reconcile PRD/TRD/Architecture/UML/ERD/Security/Threat/Test/Operability/Traceability when those contracts move.