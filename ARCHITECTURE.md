# DiagramWeave Architecture Decision Index

The normative architecture is maintained in [`docs/architecture.md`](docs/architecture.md).
This root index exists for repository tools and agents that discover conventional
architecture filenames.

## Current independently reusable modules

| Package | Responsibility |
|---|---|
| `@contextualwisdomlab/diagramweave-core` | Revision hashes, validated edit proposals, previews, and explicit application |
| `@contextualwisdomlab/diagramweave-contextual-orchestrator` | Provider-neutral, bounded, strict LLM proposal adapter |
| `@contextualwisdomlab/diagramweave-plantuml-renderer` | Sandboxed stdin-only local SVG/PNG rendering and safe diagnostics |
| `@contextualwisdomlab/diagramweave-cli` | Deterministic manual/CI validation and rendering |
| `@contextualwisdomlab/diagramweave-language-server` | Transport-neutral LSP lifecycle, diagnostics, capability-negotiated hierarchical or legacy-flat document symbols, deterministic declaration completion, conservative folding and hover, and same-document definitions and references |
| `@contextualwisdomlab/diagramweave-language-server-stdio` | Bounded JSON-RPC stdio process and `dweave-lsp` executable |

Studio, naruon, IDE extensions, and other CWL hosts compose these packages but
must not move file, UI, network, process, or persistence responsibilities into
the trust kernel.

## Active decisions

1. Source files are the sole authoritative document state.
2. AI output is an untrusted revision-bound proposal; it never saves, commits,
   pushes, or silently mutates source.
3. PlantUML runs locally through a no-shell, empty-environment, stdin-only
   `SANDBOX` process with bounded output and diagnostics.
4. Language Server source arrives as full snapshots; URIs are identifiers and
   are never dereferenced by the session.
5. Document outlines recognize only explicit high-signal declarations and fail
   by omission rather than inferring symbols from relations, includes, macros,
   renderer output, or malformed syntax.
6. Outline hierarchy is created only from one unmatched unquoted declaration
   brace closed in stack order by a standalone brace with identical indentation.
   Ambiguous or incomplete structure remains flat.
7. Hierarchical symbols are built and frozen bottom-up without recursive
   product traversal; roots and siblings remain in declaration order and parent
   ranges enclose proven children.
8. Non-hierarchical LSP clients receive immutable `SymbolInformation[]` from the
   same authoritative tree. Only exact boolean
   `hierarchicalDocumentSymbolSupport: true` selects `DocumentSymbol[]`; all
   other and hostile capability states fail closed to the flat adapter.
9. Declaration completion is a fixed, deterministic, capability-gated local
   catalog. It replaces only a line-leading prefix and returns no candidates in
   comments, quotes, relations, directives, completed declarations, or the
   middle of an identifier.
10. Conservative folding ranges reuse the authoritative document-symbol tree,
    expose only proven nonempty package and namespace scopes, and walk source
    preorder without recursive product traversal or a second parser.
11. Same-document definitions and references reuse the same authoritative
    declaration tree and conservative explicit-identifier grammar. Definitions
    resolve only one uniquely proven declaration; references return only proven
    uses of that same identity, preserve source order, honor
    `context.includeDeclaration`, and fail by omission for duplicates,
    unsupported syntax, or ambiguity.
12. Reference evidence is bounded to 4,096 locations. Overflow fails closed
    instead of returning a truncated set that could mislead rename, refactoring,
    or blast-radius decisions.
13. Diagnostics, outlines, compatibility adaptation, completion, folding, hover,
    definitions, and references are composed layers with independent tests and
    source ownership; a rejected or late mutation cannot restore stale state in
    an outer layer.
14. LSP positions use UTF-16 code units; multilingual and emoji ranges are
    regression-tested across LF, CRLF, and CR source.
15. Organization-central `.github` workflows own merge governance. Scheduled
    product development routes OpenCode through the pinned local
    `contextual-orchestrator` gateway's `orchestrator/free` pool, not Copilot
    or a direct provider credential.
16. No release occurs while packages remain `0.0.0` under `Unreleased` or while
    Studio, cross-platform runtime evidence, signing, SBOM/provenance, and
    rollback evidence remain incomplete.

## Durable decision records

- [`docs/security-model.md`](docs/security-model.md)
- [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md)
- [`docs/product/declaration-completion.md`](docs/product/declaration-completion.md)
- [`docs/product/hierarchical-document-outline.md`](docs/product/hierarchical-document-outline.md)
- [`docs/product/document-symbol-compatibility.md`](docs/product/document-symbol-compatibility.md)
- [`docs/product/folding-ranges.md`](docs/product/folding-ranges.md)
- [`docs/product/same-document-definitions.md`](docs/product/same-document-definitions.md)
- [`docs/product/same-document-references.md`](docs/product/same-document-references.md)
- [`docs/research/plantuml-structured-diagnostics.md`](docs/research/plantuml-structured-diagnostics.md)
- [`docs/research/language-server-foundation.md`](docs/research/language-server-foundation.md)
- [`docs/research/language-server-stdio.md`](docs/research/language-server-stdio.md)
- [`docs/research/plantuml-document-symbols.md`](docs/research/plantuml-document-symbols.md)
- [`docs/research/plantuml-declaration-completion.md`](docs/research/plantuml-declaration-completion.md)
- [`docs/research/plantuml-hierarchical-document-symbols.md`](docs/research/plantuml-hierarchical-document-symbols.md)
- [`docs/research/lsp-document-symbol-compatibility.md`](docs/research/lsp-document-symbol-compatibility.md)
- [`docs/research/plantuml-folding-ranges.md`](docs/research/plantuml-folding-ranges.md)
- [`docs/research/plantuml-same-document-definitions.md`](docs/research/plantuml-same-document-definitions.md)
- [`docs/research/plantuml-same-document-references.md`](docs/research/plantuml-same-document-references.md)
- [`docs/operations/document-symbols.md`](docs/operations/document-symbols.md)
- [`docs/operations/declaration-completion.md`](docs/operations/declaration-completion.md)
- [`docs/operations/hierarchical-document-symbols.md`](docs/operations/hierarchical-document-symbols.md)
- [`docs/operations/document-symbol-compatibility.md`](docs/operations/document-symbol-compatibility.md)
- [`docs/operations/folding-ranges.md`](docs/operations/folding-ranges.md)
- [`docs/operations/same-document-definitions.md`](docs/operations/same-document-definitions.md)
- [`docs/operations/same-document-references.md`](docs/operations/same-document-references.md)
- [`docs/operations/hourly-development.md`](docs/operations/hourly-development.md)
- [`docs/superpowers/specs/2026-08-05-declaration-completion-design.md`](docs/superpowers/specs/2026-08-05-declaration-completion-design.md)
- [`docs/superpowers/plans/2026-08-05-declaration-completion.md`](docs/superpowers/plans/2026-08-05-declaration-completion.md)
- [`docs/superpowers/specs/2026-08-05-hierarchical-document-symbols-design.md`](docs/superpowers/specs/2026-08-05-hierarchical-document-symbols-design.md)
- [`docs/superpowers/plans/2026-08-05-hierarchical-document-symbols.md`](docs/superpowers/plans/2026-08-05-hierarchical-document-symbols.md)
- [`docs/superpowers/specs/2026-08-05-legacy-document-symbol-fallback-design.md`](docs/superpowers/specs/2026-08-05-legacy-document-symbol-fallback-design.md)
- [`docs/superpowers/plans/2026-08-05-legacy-document-symbol-fallback.md`](docs/superpowers/plans/2026-08-05-legacy-document-symbol-fallback.md)
- [`docs/superpowers/specs/2026-08-05-conservative-folding-ranges-design.md`](docs/superpowers/specs/2026-08-05-conservative-folding-ranges-design.md)
- [`docs/superpowers/plans/2026-08-05-conservative-folding-ranges.md`](docs/superpowers/plans/2026-08-05-conservative-folding-ranges.md)
- [`docs/superpowers/specs/2026-08-07-conservative-same-document-references-design.md`](docs/superpowers/specs/2026-08-07-conservative-same-document-references-design.md)
- [`docs/superpowers/plans/2026-08-07-conservative-same-document-references.md`](docs/superpowers/plans/2026-08-07-conservative-same-document-references.md)
