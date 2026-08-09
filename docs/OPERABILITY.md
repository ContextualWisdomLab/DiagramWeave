# DiagramWeave Operability, Recovery, and Release Guide

**Status:** Accepted foundation operating baseline  
**Last reviewed:** 2026-08-09

DiagramWeave currently ships reusable packages and process boundaries rather than a hosted control plane. Operability therefore focuses on deterministic local dependencies, safe failures, bounded resources, integration observability, recovery, and release evidence. Existing feature-specific runbooks under `docs/operations/` remain authoritative for their slices.

## Runtime dependencies

### Core / Language Server

Node.js 22 or 24 under the current support contract. Core and editor-intelligence logic use Node built-ins and workspace packages only.

### PlantUML rendering

The host/distributor supplies:

- an absolute Java executable path;
- an absolute PlantUML JAR path;
- compatible license/notices and artifact provenance;
- operating-system process isolation appropriate to the deployment.

DiagramWeave does not download these dependencies or require a secret key. A missing executable/JAR is an explicit configuration failure, not an invitation to invent credentials.

### Optional model provider

The Contextual Orchestrator adapter is optional. Manual editing, rendering, CLI, diagnostics, and local LSP intelligence continue without an LLM/provider.

## Host observability

Prefer bounded fields:

- package/version/commit;
- operation/method;
- source byte/UTF-16 length without source content;
- source revision hash when policy permits;
- renderer format, elapsed time, timeout/output-limit class;
- diagnostic count/code/line number without raw source label;
- LSP method, document version/generation, result count;
- proposal acceptance/rejection/scope-expansion outcome;
- correlation ID.

Do not log full private diagram source, provider token, raw renderer stderr, absolute secret-bearing paths, arbitrary model response, or complete environment.

## Resource controls

- source/request/replacement sizes are bounded;
- renderer stdout/stderr/deadline are bounded;
- JSON-RPC messages and queues are bounded;
- document/symbol/fold/completion/reference result counts are bounded;
- child processes are terminated on deadline/failure;
- filesystem recursion/discovery is deterministic and symlink-safe.

Any new workspace-wide index, collaboration service, or Studio history store needs explicit memory/storage/backpressure design before implementation.

## Failure taxonomy

| Boundary | Example | Action |
|---|---|---|
| Core | stale revision, invalid scope | reject proposal; keep source unchanged |
| provider adapter | timeout/HTTP/invalid JSON | surface fixed bounded failure; manual workflow remains available |
| renderer config | Java/JAR missing/invalid | fix host configuration; do not fetch automatically |
| renderer execution | timeout/output/protocol failure | terminate child; expose sanitized error/diagnostic |
| CLI filesystem | symlink/collision/permission | no implicit overwrite; correct path/policy |
| LSP lifecycle/state | stale version, invalid URI/position | omit/null/fixed Invalid params according to method |
| stdio | malformed framing/oversize | reject session/request safely |
| CI/security | failed/pending required gate | no merge/release; RCA exact failing job |

## Degraded mode

Provider/orchestrator failure must not disable source editing, local rendering, CLI, or deterministic LSP intelligence. Renderer failure still permits source editing and non-renderer editor intelligence. LSP process failure must not corrupt the source file because file/save authority remains host-owned.

## Recovery

Current foundation owns no database. Recovery sources are the caller's source files and accepted saved revisions. Restarting CLI/LSP recreates transient state from source.

If a model proposal is lost, regenerate against the current exact revision; do not replay a stale proposal blindly. If a renderer fails, fix local runtime/config and rerender accepted source. If LSP state becomes inconsistent, close/reopen or restart from the host-authoritative document snapshot.

## Studio future boundary

A future Studio must add explicit autosave/recovery, local draft, revision history, collaboration conflict, account/tenant, persistence, backup, export, and accessibility runbooks before release. Those responsibilities are not silently assigned to current packages.

## Upgrade and rollback

1. inspect CHANGELOG and relevant ADR/product/operation docs;
2. run `npm ci` and `npm run verify` on the exact candidate;
3. verify renderer/CLI/LSP integration against representative host fixtures;
4. if a package/API contract changed, test naruon/IDE/CLI hosts before rollout;
5. canary package/runtime changes where externally distributed;
6. rollback by restoring the previous package/artifact version; current foundation has no data migration to reverse.

A future persisted Studio/service requires migration-specific rollback beyond package rollback.

## Release acceptance

Version remains `0.0.0` until an integrated candidate proves:

- exact Node 22/24 CI and complete test/coverage/JSDoc gates;
- SAST/security/independent review;
- package content/install/use evidence;
- PlantUML/Java provenance/license policy and claimed platform matrix;
- SBOM/provenance/reproducible build evidence;
- rollback/recovery/support documentation;
- if Studio included: Figma/product-design parity, keyboard/screen-reader/accessibility verification, persistence/recovery, installer/signing/update evidence;
- post-publication artifact verification.

## Incident RCA

Trace failures to the first owning layer: source/revision contract, provider adapter, renderer child, diagnostic sanitizer, CLI filesystem, LSP snapshot/symbol engine, stdio transport, host integration, or delivery pipeline. Fix that layer and add a regression there rather than compensating downstream.