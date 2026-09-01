# DiagramWeave

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ContextualWisdomLab/DiagramWeave)

**Source-first diagram editing with revision-safe AI proposals, local rendering, and IDE-grade language tooling.**

DiagramWeave is a modular editor platform for PlantUML and future text diagram languages. The diagram source remains authoritative: manual editing works without an account, network connection, or LLM, while model output is treated as an untrusted proposal bound to the exact source revision and must pass local validation before a host can apply it.

The repository provides independently reusable packages for source revision control, optional Contextual Orchestrator proposals, local rendering, deterministic CLI workflows, and Language Server Protocol integration. The Studio application remains a product direction rather than a shipped release.

## Why DiagramWeave

AI-assisted diagram editing becomes risky when a model can silently rewrite source, when rendering executes with ambient host authority, or when IDE features invent structure that the source does not prove. DiagramWeave separates those responsibilities.

| Need | What DiagramWeave provides |
| --- | --- |
| Safe manual editing | Source remains the authoritative document |
| AI assistance | Revision-bound edit proposals, never implicit mutations |
| Local rendering | Bounded PlantUML subprocess boundary with sanitized diagnostics |
| CI usage | Deterministic validation/rendering CLI |
| IDE integration | Transport-neutral LSP plus bounded stdio adapter |
| Reuse by other CWL products | Small workspace packages instead of a mandatory Studio app |
| Evidence preservation | Exact source hash, validated scope, immutable proposal/diagnostic objects |

## Current maturity

The root package is private and versioned `0.0.0`: **DiagramWeave is an unreleased foundation, not a published product release**. The current repository already contains reusable Core, Contextual Orchestrator adapter, PlantUML renderer, CLI, Language Server, and stdio transport packages. A complete Studio UI, broad diagram-language support, release packaging, cross-platform product evidence, and production distribution remain separate milestones.

No customer, deployment, certification, adoption, or published-package claim is implied by the presence of source code or passing repository tests.

## Quick start

DiagramWeave currently requires Node.js 22 or 24.

```bash
npm ci
npm run verify
```

`npm run verify` runs syntax checks, behavior tests, 100% production line/branch/function coverage gates, and production JSDoc coverage.

For a minimal source-proposal workflow, use the Core package:

```js
import {
  hashSource,
  previewEditProposal,
} from '@contextualwisdomlab/diagramweave-core';

const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';
const proposal = {
  schemaVersion: '1.0',
  proposalId: 'proposal_alpha',
  documentId: 'diagram_document_alpha',
  baseRevisionHash: hashSource(source),
  operationType: 'modify_selection',
  requestedScope: { start: 24, end: 29 },
  effectiveScope: { start: 24, end: 29 },
  replacement: 'goodbye',
  summary: 'Replace the message label.',
  assumptions: ['The selected range is the intended label.'],
};

const preview = previewEditProposal(source, proposal);
console.log(preview.nextSource);
```

The preview does not save or apply the edit. The host remains responsible for review, acceptance, persistence, and version control.

## Product surfaces

### Core

`@contextualwisdomlab/diagramweave-core` is the zero-dependency trust kernel. It owns deterministic source hashes, proposal validation, scope/revision checks, and safe preview behavior. It does not read files, call models, render diagrams, or perform hidden mutations.

### Contextual Orchestrator adapter

`@contextualwisdomlab/diagramweave-contextual-orchestrator` requests bounded edit proposals through [`ContextualWisdomLab/contextual-orchestrator`](https://github.com/ContextualWisdomLab/contextual-orchestrator). Provider routing and credentials remain owned by Contextual Orchestrator. The adapter returns Core-validated proposals and never saves them automatically.

### Local PlantUML renderer

`@contextualwisdomlab/diagramweave-plantuml-renderer` invokes a host-supplied Java executable and PlantUML JAR without a shell, with an empty child environment, bounded source/output/diagnostic/deadline limits, PlantUML `SANDBOX`, metadata suppression, and sanitized fixed-shape diagnostics. Its supported public bounds are exposed through `plantUmlRendererLimits`.

DiagramWeave does **not** bundle or download PlantUML. ContextualWisdomLab integrations must supply a commercially compatible **Apache License 2.0 or MIT PlantUML distribution** and retain its required notices; GPL/LGPL PlantUML artifacts are not an accepted inbound path for this ecosystem. PlantUML publishes Apache-2.0 and MIT builds that retain UML rendering capability, so the product does not need a copyleft artifact as its supported renderer boundary.

### CLI

`@contextualwisdomlab/diagramweave-cli` provides deterministic validation and rendering for one file or a directory:

```bash
dweave validate ./diagrams --java /absolute/path/to/java --jar /absolute/path/to/plantuml.jar
dweave render ./diagrams --output ./artifacts --java /absolute/path/to/java --jar /absolute/path/to/plantuml.jar
```

The CLI uses stable discovery order, rejects symbolic links and output collisions, publishes artifacts with bounded filesystem rules, and can emit source-free structured diagnostics. See [`packages/cli/README.md`](packages/cli/README.md) for the full command and embedding contract.

### Language Server

`@contextualwisdomlab/diagramweave-language-server` provides a transport-neutral LSP 3.18 session for local diagnostics and conservative source-backed language features, including document symbols, declaration completion, folding ranges, hover, same-document definition, and references.

The public compatibility contract remains explicit. Document outlines use capability-negotiated `textDocument/documentSymbol`. The Hierarchical-outline product slice returns the authoritative tree when a client advertises `hierarchicalDocumentSymbolSupport: true`; legacy clients receive `SymbolInformation[]`. Declaration completion is capability-gated
`textDocument/completion`, and Studio, IDE extensions, naruon, and other CWL hosts reuse this package. Folding advertises `foldingRangeProvider` and serves `textDocument/foldingRange`; same-document reference navigation serves `textDocument/references`.

`@contextualwisdomlab/diagramweave-language-server-stdio` exposes the same session through bounded JSON-RPC stdio as `dweave-lsp`. Hosts supply Java and the approved PlantUML artifact explicitly:

```bash
DIAGRAMWEAVE_JAVA_PATH=/absolute/path/to/java \
DIAGRAMWEAVE_PLANTUML_JAR_PATH=/absolute/path/to/plantuml.jar \
dweave-lsp
```

Language features fail by omission when the source does not prove a safe answer. They do not invoke an LLM, renderer, workspace scan, include processor, macro processor, shell, or network service merely to fabricate semantic evidence.

## Trust model

```text
Authoritative diagram source
          │
          ├──────────────► local parser / LSP evidence
          │
          ├──────────────► sandboxed local renderer
          │
          └─ optional bounded context ─► Contextual Orchestrator
                                           │
                                           ▼
                                    untrusted proposal
                                           │
                         revision / schema / scope validation
                                           │
                                           ▼
                                      host review
                                           │
                                      apply or reject
```

The critical invariants are simple: source is authoritative; context disclosure is host-controlled; proposals reference an exact SHA-256 revision; scope expansion requires an explicit reason and host approval; renderer output is sanitized before crossing the boundary; and IDE records are derived only from accepted local source evidence.

See [`docs/security-model.md`](docs/security-model.md) for the full trust model and [`docs/architecture.md`](docs/architecture.md) for package boundaries.

## Ecosystem integration

DiagramWeave remains independently reusable. Naruon, CI systems, IDE extensions, or a future Studio can consume its packages without importing one another's application state.

- `contextual-orchestrator` owns provider/model routing and credentials.
- Naruon may consume DiagramWeave's published package/CLI/LSP contracts but does not become DiagramWeave's source authority.
- Hosts own file persistence, user approval, keychain/secret access, and process transport outside the bounded packages.
- The renderer owns only validated local rendering; it does not own the PlantUML distribution or its license.

## Verification

```bash
npm run verify
```

Repository verification proves the current source contract only. It does not establish a published release, cross-platform production deployment, third-party renderer license compliance, or customer acceptance. Integration decisions must use checks and reviews bound to the unchanged exact pull-request head.

## Documentation map

| Goal | Start here |
| --- | --- |
| Product requirements | [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md) |
| Architecture | [`docs/architecture.md`](docs/architecture.md) |
| Security/trust model | [`docs/security-model.md`](docs/security-model.md) |
| CLI integration | [`packages/cli/README.md`](packages/cli/README.md) |
| Language Server | [`packages/language-server/README.md`](packages/language-server/README.md) |
| stdio LSP adapter | [`packages/language-server-stdio/README.md`](packages/language-server-stdio/README.md) |
| Contextual Orchestrator operations | [`docs/operations/contextual-orchestrator.md`](docs/operations/contextual-orchestrator.md) |
| Renderer operations | [`docs/operations/plantuml-renderer.md`](docs/operations/plantuml-renderer.md) |
| Research notes | [`docs/research/`](docs/research/) |
| Change history | [`CHANGELOG.md`](CHANGELOG.md) |
| Security reporting | [`SECURITY.md`](SECURITY.md) |

Detailed feature-slice and operations documents remain in `docs/product/` and `docs/operations/`; the root README intentionally stays at product and integration level.

## Contributing

Preserve source authority and package boundaries. New AI behavior must remain proposal-only until deterministic validation and explicit host review; new language features must be source-evidence-backed; renderer changes must preserve the no-shell, no-ambient-environment and bounded-output contract. Update tests and the relevant product/architecture/security documentation together when a public contract changes.

## License

DiagramWeave source is licensed under the [MIT License](LICENSE). Third-party tools and artifacts retain their own terms. ContextualWisdomLab-supported PlantUML integration uses the upstream Apache-2.0 or MIT flavor rather than a GPL-family distribution.
