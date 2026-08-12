# DiagramWeave Technical Requirements Document

**Status:** Accepted technical baseline for protected `main` at `7ee5b04a6fabf4fdf81a4d7bd1d662c48aa5f31d`
**Last reviewed:** 2026-08-12

## 1. Technical objective

Build a source-first text-diagram platform in which manual source remains authoritative, model output is an untrusted revision-bound proposal, rendering is isolated and bounded, editor intelligence is conservative and deterministic, and every package can be reused independently by Studio, naruon, IDEs, CI, or another CWL host.

The detailed product requirements remain canonical in `docs/product/diagramweave-prd.md`; this document defines cross-cutting implementation contracts.

## 2. As-built package boundaries

| Package | Owns | Must not own |
|---|---|---|
| `diagramweave-core` | source hashing, proposal validation, exact-revision preview/application, range/scope validation | model calls, renderer, files, persistence, hidden mutations |
| `diagramweave-contextual-orchestrator` | bounded provider request/response adapter, endpoint safety, strict proposal parsing | credential persistence, proposal application, file access |
| `diagramweave-plantuml-renderer` | stdin-only PlantUML execution, sandbox flags, bounded output/timeout, safe diagnostics | source-file writes, includes/network, package download, host UI |
| `diagramweave-cli` | deterministic validate/render filesystem boundary and atomic artifact publication | LLM, implicit overwrite, Studio state |
| `diagramweave-language-server` | transport-neutral LSP lifecycle, accepted document snapshots, deterministic editor intelligence | file watching, workspace persistence, remote includes/macros, UI state |
| `diagramweave-language-server-stdio` | bounded Content-Length / JSON-RPC stdio framing and process lifecycle | feature semantics or a second editor-intelligence implementation |

## 3. Source and revision invariants

- Saved/manual source is the system of record.
- A model proposal is associated with an exact SHA-256 base revision.
- Proposal application fails when the current source revision differs.
- Requested/effective ranges use validated UTF-16 offsets where the contract requires LSP/editor compatibility.
- Scope expansion must be explicit, justified, and approved by the host/user.
- Preview/application returns immutable normalized values and never mutates source implicitly.

## 4. Model/provider boundary

The Contextual Orchestrator adapter is optional. It accepts only a validated HTTPS endpoint or loopback HTTP, bounded source/instruction sizes, explicit token/model/configuration, and a non-streaming strict response contract. Provider error bodies, raw prompts/responses/tokens, and host environment values must not cross diagnostic/logging boundaries.

Model output is data. It cannot alter permissions, execute tools, save a file, apply an edit, or bypass Core validation.

## 5. Renderer boundary

PlantUML execution is local and sandboxed:

- host supplies absolute Java and JAR paths;
- source is sent only through stdin;
- no shell;
- child environment empty;
- PlantUML `SANDBOX`, UTF-8, source-metadata suppression, and standard-report mode are required;
- source/stdout/stderr/wall-clock are bounded;
- output must be one valid supported SVG/PNG stream;
- raw stderr/source/labels/executable paths remain inside the renderer boundary;
- diagnostics crossing package boundaries are normalized, cloned, bounded, and frozen.

No missing key, cloud token, renderer download credential, or external resource is assumed.

## 6. CLI filesystem contract

The CLI uses stable lexical discovery, rejects symbolic links and unsafe paths, rejects predictable output collisions, and uses exclusive or explicit atomic replacement semantics. It reuses the renderer's structured diagnostics rather than parsing raw child output independently. Human/JSON output is source-minimized and bounded.

## 7. Language Server architecture

The Language Server is transport-neutral. Accepted full-document snapshots are authoritative for editor intelligence. Stale asynchronous open/change/close completion must not restore superseded state.

### One authoritative symbol tree

Explicit PlantUML declarations are parsed once into a bounded symbol tree. Document symbols, legacy `SymbolInformation[]`, completion context, folding, hover, definition, and compatible subsequent features reuse this structural evidence rather than introducing divergent parsers.

Hierarchy exists only when complete stack-ordered unquoted package/namespace braces and matching indentation prove ownership. Ambiguous/malformed structure fails by omission.

### Capability negotiation

A feature is advertised only when the client provides the required valid capability shape. Hostile getters/proxies/malformed values fail closed. Unsupported clients retain standards-compatible behavior from the same canonical source model.

### Position correctness

Positions/ranges use UTF-16 code units, including multilingual source and emoji. Invalid positions become fixed protocol errors/null/empty results according to the LSP method contract and must not reflect source/URI values.

## 8. Current editor and governance features

Implemented on protected main:

- safe renderer diagnostics;
- hierarchical/flat document symbols;
- declaration completion;
- conservative package/namespace folding;
- evidence-bounded declaration hover;
- same-document conservative definition navigation;
- same-document conservative reference navigation;
- work-conserving hourly remediation/product-development governance.

These capabilities were integrated through PR #22 and PR #24 and are protected-main claims at the baseline above.

## 9. Security/trust invariants

- runtime packages must not expose arbitrary shell/network/file/database capability beyond their explicit adapter boundary;
- renderer child process receives no ambient secret-bearing environment;
- model/provider input/output is untrusted and revision-bound;
- source/URI/error details are minimized at reusable boundaries;
- editor intelligence never dereferences includes, executes macros, scans a workspace, calls an LLM/renderer, or reads files behind an accepted snapshot;
- autonomous development credentials and merge/release authority remain separated.

See `docs/security-model.md` and `docs/THREAT_MODEL.md`.

## 10. Quality contract

- Node.js 22 and 24 supported by the current repository contract;
- complete repository tests;
- production line/branch/function coverage exactly 100%;
- public JSDoc coverage 100%;
- syntax and package-content verification;
- exact-current-head security/SAST/review evidence before merge;
- deterministic hostile-input and stale-state tests;
- no skipped/cancelled/stale/predecessor evidence counted as passing.

## 11. Product UI boundary

DiagramWeave Studio remains future-host architecture on current protected main. Before implementing Studio visual workflows, Product Design/Figma must cover source/preview/diagnostic/outline/completion/diff/offline/provider-timeout/stale-proposal/scope-expansion/recovery and keyboard/screen-reader states. Backend/package work does not invent UI claims.

## 12. Persistence/data model

Current foundation has no database and no hidden document store. Source and accepted snapshots are in-process/host-owned. If Studio or a service adds persistence, it requires a separate physical data model, tenant/authorization/lifecycle/backup/migration/rollback design, ADR, and tests. `docs/ERD.md` is therefore conceptual, not a migration claim.

## 13. Change control

A material change to source authority, proposal mutation semantics, renderer isolation, symbol-tree authority, LSP transport ownership, persistence, provider boundary, or autonomous/release credentials requires ADR plus PRD/TRD/Architecture/UML/ERD/Security/Test/Operability/Traceability reconciliation.
