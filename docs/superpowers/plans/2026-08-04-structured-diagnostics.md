# Structured PlantUML Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans for future changes. This plan records the completed bounded implementation and its verification evidence.

**Goal:** Parse PlantUML `-stdrpt:1` output once at the renderer boundary and propagate safe immutable line diagnostics through renderer errors and CLI reports.

**Architecture:** `standard-report.js` owns the pure bounded parser and reusable sanitizer. The renderer attaches only validated LSP-compatible records to source-free errors; the CLI validates and clones them again before deterministic JSON or human publication.

**Tech Stack:** Node.js 22–24 ESM, built-in `TextDecoder`, `node:test`, existing DiagramWeave renderer and CLI packages.

## Global constraints

- Production line, branch, and function coverage remain 100%.
- Production JSDoc coverage remains 100%.
- No runtime dependency was added.
- No source, raw stderr, raw label, executable path, JAR path, absolute parent path, credential, or provider message crosses the public boundary.
- Package versions remain `0.0.0`; `CHANGELOG.md` remains under `Unreleased`.
- Tests contain no skipped or todo cases.
- Durable research references use APA 7th edition.

## Completed file map

- `packages/plantuml-renderer/src/standard-report.js`: strict parser and diagnostic sanitizer.
- `packages/plantuml-renderer/src/errors.js`: frozen diagnostic ownership.
- `packages/plantuml-renderer/src/renderer.js`: standard-report integration.
- `packages/plantuml-renderer/src/index.js`: public parser and sanitizer exports.
- `packages/plantuml-renderer/test/standard-report.test.js`: protocol, boundary, and privacy corpus.
- `packages/plantuml-renderer/test/review-regressions.test.js`: renderer propagation and immutability.
- `packages/cli/src/diagnostics.js`: renderer-boundary revalidation.
- `packages/cli/src/execute.js`: diagnostics in every report and file record.
- `packages/cli/src/presentation.js`: line-addressable human output.
- `packages/cli/test/diagnostics.test.js`: hostile and malformed input corpus.
- `packages/cli/test/structured-diagnostics.test.js`: end-to-end CLI report and presentation contract.
- Product, architecture, operations, research, package, and changelog documentation.

---

### Task 1: Pure PlantUML standard-report parser

- [x] Add the official PlantUML syntax-error report at line 2 as a failing fixture.
- [x] Add LF, CRLF, success, error, unknown, locationless, malformed, overflow, repeated-status, unsupported-version, narrative, label-privacy, and invalid-UTF-8 cases.
- [x] Implement fatal UTF-8 decoding and exact known-field validation.
- [x] Map the one-based PlantUML line to a zero-based, zero-width LSP range.
- [x] Ignore raw labels and narrative lines rather than retaining them.
- [x] Deeply freeze parser results and nested diagnostics.

### Task 2: Safe reusable diagnostic sanitizer

- [x] Validate the exact LSP-compatible PlantUML record.
- [x] Bound a collection to at most 32 diagnostics.
- [x] Clone every accepted nested object.
- [x] Fail the entire collection closed for malformed, oversized, or hostile input.
- [x] Reuse the sanitizer in `PlantUmlRendererError` and the CLI.

### Task 3: Renderer error propagation

- [x] Replace the legacy status-only inspector with `parsePlantUmlStandardReport`.
- [x] Preserve nonzero exit, signal, error status, and invalid-report failure semantics.
- [x] Attach only safe diagnostics to `renderer_failed`.
- [x] Ensure every renderer error owns a frozen diagnostics array.
- [x] Prove caller mutation cannot mutate renderer errors.

### Task 4: CLI JSON propagation

- [x] Add top-level `diagnostics: []` to every report.
- [x] Add `diagnostics` to every per-file result.
- [x] Copy only revalidated renderer diagnostics.
- [x] Use empty arrays for success, input-read, publication, help, and invocation results.
- [x] Isolate hostile error getters and arbitrary thrown objects.
- [x] Deeply freeze arrays and nested records.

### Task 5: Human-readable output

- [x] Print one indented diagnostic after its `FAIL` line.
- [x] Use the normalized relative path and one-based `plantUmlLineNumber`.
- [x] Preserve canonical one-line JSON output.
- [x] Avoid source excerpts, raw labels, and fabricated positions.

### Task 6: Durable documentation and research

- [x] Publish the exact diagnostic record in renderer and CLI READMEs.
- [x] Document process, privacy, limits, error semantics, and operational limitations.
- [x] Update the PRD and architecture to identify the implemented foundation and remaining Language Server work.
- [x] Add a dedicated research note with PlantUML, LSP 3.18, and SARIF references in APA 7 style.
- [x] Update `CHANGELOG.md` under `Unreleased`.

### Task 7: Verification evidence

The exact clean implementation tree completed:

```text
242 tests passed
0 failed
0 cancelled
0 skipped
0 todo
production line coverage: 100%
production branch coverage: 100%
production function coverage: 100%
production JSDoc modules: 15/15
JavaScript syntax: 36 files
```

Both package dry runs succeeded and contained only LICENSE, README, package metadata, and intended `src/*.js` files.

### Task 8: PR review and merge gate

- [ ] Mark the pull request ready after durable documentation and exact-head verification.
- [ ] Review every current-head thread and implement valid findings test-first.
- [ ] Require exact-head Node 22/24 CI, Semgrep, security scans, and CodeRabbit success.
- [ ] Merge only after all threads are resolved and the latest head remains mergeable.
