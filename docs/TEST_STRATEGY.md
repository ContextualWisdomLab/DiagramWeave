# DiagramWeave Test Strategy

**Status:** Accepted quality baseline  
**Last reviewed:** 2026-08-09

## Objective

Prove source/revision safety, renderer isolation, deterministic editor intelligence, protocol correctness, filesystem safety, package reusability, and automation authority with realistic hostile cases. Tests should fail at the owning boundary rather than masking an upstream defect in an outer integration layer.

## Required repository gates

- `npm run syntax`;
- complete Node test suite;
- production line coverage exactly 100%;
- production branch coverage exactly 100%;
- production function coverage exactly 100%;
- public production JSDoc coverage 100%;
- package-content / dry-run verification where applicable;
- Node.js 22 and 24 current-head CI;
- current-head SAST/security/review gates.

A queued, cancelled, skipped-required, absent, stale, predecessor-head, synthetic-only, or failed result is never acceptance evidence.

## Core trust-kernel tests

- deterministic SHA-256 source revision;
- exact proposal schema and identifiers;
- requested/effective UTF-16 range validation;
- stale base revision rejection;
- scope-expansion reason and explicit approval requirement;
- preview/application immutability;
- multilingual/emoji UTF-16 offset correctness;
- malformed, cyclic/hostile object/proxy input where public boundaries permit plain-data-only records.

## Orchestrator adapter tests

- HTTPS and loopback HTTP policy;
- reject remote plaintext/non-allowed endpoints;
- bounded source/instruction/model/token configuration;
- exact request contract;
- timeout, transport, HTTP, response-shape, assistant-JSON failure classes;
- provider error body/source/token non-reflection;
- strict Core revalidation of parsed proposals;
- no proposal application/save side effect.

Use bounded live model tests only where deterministic contract tests cannot establish provider conformance; model-backed scheduled tests use `NVIDIA_NIM_API_KEY`, never GitHub Copilot development credentials.

## Renderer tests

- host-supplied absolute Java/JAR paths;
- no shell and empty child environment;
- stdin-only source;
- PlantUML SANDBOX and metadata-suppression flags;
- source/stdout/stderr/deadline limits;
- valid SVG/PNG structure;
- malformed/truncated/multi-artifact output rejection;
- standard-report diagnostics converted to fixed LSP-compatible records;
- raw stderr/labels/source/path exclusion from public failures;
- cancellation/process cleanup;
- renderer boundary reusable without Studio.

Where practical, retain a small real PlantUML integration lane in addition to fake-process unit contracts, without assuming nonexistent API keys.

## CLI tests

- single-file and recursive stable discovery;
- `.puml`/`.plantuml` filters;
- symlink/path traversal rejection;
- output collision and explicit overwrite behavior;
- exclusive/atomic publication;
- human/JSON fixed error/diagnostic output;
- exit codes;
- renderer diagnostic revalidation rather than trusting thrown object shape.

## Language Server tests

### Lifecycle and state

- initialize/initialized/shutdown/exit ordering;
- local URI/language/version validation;
- didOpen/didChange/didClose accepted snapshots;
- stale async generation/version suppression;
- bounded source/document counts and cleanup.

### Structural intelligence

- explicit declaration recognition only;
- comments, quotes, directives, relations, includes, macros, malformed/ambiguous syntax fail by omission;
- complete matching package/namespace scopes and source-order children;
- one authoritative symbol tree reused for flat symbols, completion context, folds, hover, definitions, and subsequent references;
- no recursive unbounded traversal.

### Protocol methods

- capability advertisement only for valid supported capability shapes;
- hostile getters/proxies fail closed;
- exact UTF-16 ranges for multilingual/emoji source;
- completion text edit and omission contexts;
- folding limit/line-only contract;
- hover fixed/evidence-bounded content and safe Markdown;
- definition same-document exact locations;
- PR #22 references tests remain active-PR evidence until merge;
- invalid positions map to fixed null/empty/Invalid params results without source/URI reflection.

## stdio/JSON-RPC tests

- strict ASCII Content-Length framing;
- duplicate/missing/oversized/non-ASCII/malformed headers;
- UTF-8 and JSON-RPC 2.0 validation;
- serialized queue/dispatch ordering;
- bounded response/notification writes;
- graceful shutdown/exit codes;
- no duplication of LSP feature semantics in the transport package.

## Security and privacy tests

Mirror `docs/THREAT_MODEL.md`: source/model prompt injection boundaries, child environment isolation, raw diagnostic minimization, symlink/output safety, provider endpoint validation, stale-state races, URI/source reflection, and autonomous credential/merge-authority separation.

## Documentation contract

CI must retain discoverable PRD, TRD, Architecture, UML, conceptual ERD, security model, threat model, test strategy, operability, traceability, ADR index, AGENTS, CLAUDE, README, and CHANGELOG. Tests should explicitly prevent active PR #22/#24 behavior from being promoted to protected-main claims before integration.

## Release acceptance

Version `0.0.0` remains unreleased. Release tests must additionally prove packaged workspace contents, cross-platform renderer/runtime behavior as claimed, dependency/license provenance, SBOM/provenance, installation/use outside source checkout, Studio/accessibility evidence if Studio is included, rollback/recovery, and protected-head review/security acceptance.