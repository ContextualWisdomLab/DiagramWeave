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
| `@contextualwisdomlab/diagramweave-language-server` | Transport-neutral LSP lifecycle, diagnostics, document symbols, and deterministic declaration completion |
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
   by omission rather than inferring symbols from relations, includes, or
   malformed syntax.
6. Declaration completion is a fixed, deterministic, capability-gated local
   catalog. It replaces only a line-leading prefix and returns no candidates in
   comments, quotes, relations, directives, completed declarations, or the
   middle of a keyword.
7. Diagnostics, outlines, and completion are composed layers with independent
   tests and source ownership; a rejected or late mutation cannot restore stale
   state in an outer layer.
8. LSP positions use UTF-16 code units; multilingual and emoji ranges are
   regression-tested across LF, CRLF, and CR source.
9. Organization-central `.github` workflows own merge governance. Scheduled
   product development uses OpenCode with `NVIDIA_NIM_API_KEY`, not Copilot.
10. No release occurs while packages remain `0.0.0` under `Unreleased` or while
    Studio, cross-platform runtime evidence, signing, SBOM/provenance, and
    rollback evidence remain incomplete.

## Durable decision records

- [`docs/security-model.md`](docs/security-model.md)
- [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md)
- [`docs/product/declaration-completion.md`](docs/product/declaration-completion.md)
- [`docs/research/plantuml-structured-diagnostics.md`](docs/research/plantuml-structured-diagnostics.md)
- [`docs/research/language-server-foundation.md`](docs/research/language-server-foundation.md)
- [`docs/research/language-server-stdio.md`](docs/research/language-server-stdio.md)
- [`docs/research/plantuml-document-symbols.md`](docs/research/plantuml-document-symbols.md)
- [`docs/research/plantuml-declaration-completion.md`](docs/research/plantuml-declaration-completion.md)
- [`docs/operations/document-symbols.md`](docs/operations/document-symbols.md)
- [`docs/operations/declaration-completion.md`](docs/operations/declaration-completion.md)
- [`docs/operations/hourly-development.md`](docs/operations/hourly-development.md)
- [`docs/superpowers/specs/2026-08-05-declaration-completion-design.md`](docs/superpowers/specs/2026-08-05-declaration-completion-design.md)
- [`docs/superpowers/plans/2026-08-05-declaration-completion.md`](docs/superpowers/plans/2026-08-05-declaration-completion.md)
