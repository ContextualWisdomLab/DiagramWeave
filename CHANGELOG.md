# Changelog

All notable changes to DiagramWeave will be documented in this file.

The project follows Semantic Versioning after the first release.

## [Unreleased]

### Changed

- Hourly development now routes an open same-repository pull request into an
  RCA-driven exact-head remediation session, verifies candidate actions against
  live review and Check evidence, publishes only a normal fast-forward repair
  after full repository verification, and re-fetches post-push state.
- When no pull request is open, the same credential-isolated OpenCode workflow
  uses NVIDIA NIM (`NVIDIA_NIM_API_KEY`) to create at most one bounded product
  pull request; it no longer assumes `COPILOT_GITHUB_TOKEN` or the Copilot
  Agent Tasks API and rechecks the queue immediately before creation.

### Security

- Hourly remediation and product-branch pushes now use a masked,
  command-scoped HTTP authorization header. Repository tokens are no longer
  embedded in Git remote URLs or persisted in repository configuration.

### Added

- Conservative same-document LSP 3.18 `textDocument/references` navigation for uniquely proven explicit PlantUML identifiers, with `referencesProvider` capability negotiation, mandatory boolean `context.includeDeclaration`, authoritative document-symbol identity, exact UTF-16 source-order immutable `Location[]`, duplicate and malformed ambiguity omission, an inclusive 4,096-location ceiling with fail-closed overflow, accepted-snapshot race protection, and shared Studio, IDE, stdio, naruon, and CWL host behavior without an LLM, renderer, file read, URI dereference, include, macro, workspace scan, shell, or network request.
- Conservative same-document LSP 3.18 `textDocument/definition` navigation for uniquely proven explicit PlantUML identifiers, with `definitionProvider` capability negotiation, authoritative document-symbol target ranges, exact UTF-16 declaration, alias, relation-endpoint, and member-owner tokens, duplicate and malformed ambiguity omission, immutable `Location | null` results, accepted-snapshot race protection, and shared Studio, IDE, stdio, naruon, and CWL host behavior without an LLM, renderer, file read, URI dereference, include, macro, workspace scan, shell, or network request.
- Evidence-bounded LSP 3.18 `textDocument/hover` for explicit PlantUML declaration labels, with `hoverProvider` capability negotiation, bounded client-preferred plaintext or Markdown, exact authoritative UTF-16 selection ranges, immediate proven package or namespace context, non-terminable dynamic Markdown fences, immutable accepted-snapshot responses, stale-mutation protection, and shared Studio, IDE, stdio, naruon, and CWL host behavior without an LLM, renderer, file read, include, macro, workspace scan, shell, or network request.
- Conservative LSP 3.18 `textDocument/foldingRange` support for nonempty package and namespace scopes proven by the authoritative document-symbol tree, with `foldingRangeProvider` capability negotiation, bounded `rangeLimit`, boolean `lineFoldingOnly`, iterative source-order traversal, immutable line-only records, stale-snapshot protection, and shared Studio, IDE, stdio, naruon, and CWL host behavior without an LLM, renderer, file read, or network request.
- Capability-negotiated LSP 3.18 document symbols that preserve the authoritative hierarchical `DocumentSymbol[]` tree for clients explicitly advertising `hierarchicalDocumentSymbolSupport: true` and derive deeply frozen source-order `SymbolInformation[]` with validated local locations and immediate `containerName` values for legacy clients, without a second parser, recursive traversal, renderer, LLM, file read, or network request.
- Conservative hierarchical LSP 3.18 document symbols for complete explicit PlantUML declaration scopes, with optional frozen `children`, enclosing parent ranges through indentation-matched standalone closing braces, source-order roots and siblings, quoted/commented/ambiguous-brace omission, nonrecursive bottom-up tree construction, and unchanged Studio, IDE, stdio, naruon, and CWL host boundaries.
- Deterministic LSP 3.18 `textDocument/completion` for line-leading PlantUML declaration keywords, with initialize-time client capability negotiation, exact UTF-16 text edits, stable immutable candidates, comment/string/relation/directive and mid-keyword suppression, bounded latest-document snapshots, JSON-RPC invalid-parameter mapping, and shared Studio, IDE, stdio, naruon, and CWL host integration without an LLM, renderer, file read, or network request.
- Conservative LSP 3.18 `textDocument/documentSymbol` outlines for explicit PlantUML declarations, with UTF-16 ranges, quoted and aliased labels, comment masking, bounded symbol counts and names, immutable records, exact open-document snapshots, and stale concurrent mutation suppression across Studio, IDE, stdio, naruon, and CWL hosts.
- A bounded JSON-RPC 2.0 stdio transport and `dweave-lsp` executable for the transport-neutral Language Server, with strict UTF-8 Content-Length framing, fixed source-free protocol errors, serialized request/notification processing, graceful shutdown/exit semantics, and independently reusable Studio, IDE, naruon, and CWL host adapters.
- A transport-neutral LSP 3.18 PlantUML diagnostic session with bounded full-document synchronization, local file-URI validation, exact version/generation stale-result suppression, deeply frozen source-free diagnostics, and embeddable Studio, IDE, naruon, and CWL host APIs.
- Safe structured PlantUML diagnostics that parse bounded `-stdrpt:1` output at the renderer boundary, map one-based PlantUML lines to zero-based LSP-compatible ranges, deeply freeze every record, and propagate only fixed-message diagnostics through renderer errors and `dweave` JSON/human reports without exposing raw stderr, raw labels, source excerpts, executable paths, or credentials.
- A deterministic `dweave validate` and `dweave render` CLI package for one PlantUML file or a recursive directory, with stable JSON and human reports, CI exit codes, symlink and collision rejection, exclusive creation, explicit atomic overwrite, and naruon/CWL embedding APIs.
- Repository contracts and zero-dependency Node.js quality gates.
- Revision-safe edit proposals as the first DiagramWeave Core capability.
- A Contextual Orchestrator adapter boundary for validated LLM proposals.
- A sandboxed, stdin-only PlantUML renderer with bounded SVG/PNG artifacts, a frozen public limit contract, single-pass SVG document and restricted XML prologue validation, source metadata suppression, standard-report error detection, and child termination on stream failures.
- Architecture, security, product, research, and Contextual Orchestrator operations documentation.
- Pull-request-first hourly review, repair, exact-head verification, merge, and bounded product-development governance.
