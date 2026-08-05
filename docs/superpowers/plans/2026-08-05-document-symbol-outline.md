# PlantUML Document Symbol Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, source-linked LSP 3.18 document symbols for explicit PlantUML declarations across the in-process and stdio Language Server surfaces.

**Architecture:** Keep the existing diagnostic session unchanged. A wrapper owns sanitized open-document snapshots, advertises document symbols, orders concurrent mutations, and delegates all diagnostics and lifecycle. A separate conservative scanner produces flat immutable `DocumentSymbol[]` records in UTF-16 declaration order.

**Tech Stack:** Node.js 22/24 ESM, Node test runner, LSP 3.18, existing DiagramWeave Language Server and JSON-RPC stdio packages.

## Global Constraints

- Production statement, branch, and function coverage must each be exactly 100%.
- Every production export and security boundary must have explanatory JSDoc.
- Skipped and todo tests are prohibited.
- The scanner must not read files, run PlantUML, evaluate macros, resolve includes, or call an LLM.
- No source excerpt, raw error, renderer output, path, environment value, or credential may enter public errors.
- Positions use UTF-16 code units.
- One source is limited to 1 MiB, one session to 256 open documents, one document to 1,024 symbols, and one symbol name to 1,024 UTF-8 bytes.
- Database objects are not introduced.
- Versions remain `0.0.0`; changes stay under `Unreleased`.

---

### Task 1: Define the conservative symbol contract

**Files:**
- Create: `packages/language-server/test/symbols.test.js`
- Create: `packages/language-server/src/symbols.js`
- Modify: `packages/language-server/src/limits.js`
- Modify: `packages/language-server/test/contracts.test.js`

**Interfaces:**
- Consumes: `LanguageServerError`, `languageServerLimits`.
- Produces: internal `documentSymbolsForSource(source: unknown): readonly DocumentSymbol[]`.

- [x] **Step 1: Write failing realistic tests** for explicit class, sequence, component, deployment, use-case, and state declarations; aliases; multilingual labels; emoji positions; comments; malformed declarations; and immutable results.
- [x] **Step 2: Run the focused tests** and confirm failure because `symbols.js` and symbol limits do not exist.
- [x] **Step 3: Implement the minimal scanner** with declaration matching, UTF-16-preserving comment masking, bounded label parsing, stable SymbolKinds, and deeply frozen ranges.
- [x] **Step 4: Add source, name, and symbol-count failures** and verify every inclusive limit path.
- [x] **Step 5: Run the focused tests** and confirm no failures, skips, or todos.
- [x] **Step 6: Commit** the scanner, tests, and limits.

### Task 2: Compose document symbols into the Language Server session

**Files:**
- Create: `packages/language-server/src/symbol-session.js`
- Create: `packages/language-server/test/symbol-session.test.js`
- Modify: `packages/language-server/src/index.js`
- Modify: `packages/language-server/test/session.test.js`

**Interfaces:**
- Consumes: `createDiagnosticSession(options)`, contract normalizers, and `documentSymbolsForSource(source)`.
- Produces: public `createLanguageServerSession(options)` with `documentSymbolProvider: true` and `textDocument/documentSymbol`.

- [x] **Step 1: Write failing lifecycle tests** for before-initialize, before-ready, unopened, open, change, close, shutdown, exit, and disposal.
- [x] **Step 2: Write failing hostile-input tests** for malformed request records, property getters, remote URIs, duplicate open, rejected changes, and missing close targets.
- [x] **Step 3: Write failing concurrency tests** for pending open plus newer change, rejected newer open, and close during validation.
- [x] **Step 4: Implement the wrapper** with sanitized copies, active mutation sets, epochs, sequences, and latest-applied ordering.
- [x] **Step 5: Export the wrapper under the existing public session name** and update the expected initialize capability.
- [x] **Step 6: Run all Language Server tests** and require 100% production line/branch/function coverage.
- [x] **Step 7: Commit** the session composition and tests.

### Task 3: Verify the real stdio product path

**Files:**
- Create: `packages/language-server-stdio/test/document-symbol.test.js`

**Interfaces:**
- Consumes: `createLanguageServerStdioConnection` and the public Language Server session.
- Produces: an end-to-end JSON-RPC regression fixture for initialize, open, documentSymbol, shutdown, and exit.

- [x] **Step 1: Write the failing combined-frame stdio test** with a realistic package and component source.
- [x] **Step 2: Run it** and confirm failure because the session does not advertise or handle document symbols.
- [x] **Step 3: Reuse the public wrapper** without adding transport-specific symbol logic.
- [x] **Step 4: Verify exact response ranges and graceful exit** through the bounded stdio connection.
- [x] **Step 5: Commit** the end-to-end fixture.

### Task 4: Publish durable product and standards documentation

**Files:**
- Modify: `packages/language-server/README.md`
- Create: `docs/research/plantuml-document-symbols.md`
- Create: `docs/operations/document-symbols.md`
- Create: `docs/product/document-symbol-outline.md`
- Create: `docs/superpowers/specs/2026-08-05-document-symbol-outline-design.md`
- Modify: `CHANGELOG.md`
- Create: `tests/document-symbol-repository-contract.test.js`

**Interfaces:**
- Produces: APA 7th standards traceability and repository-enforced product contracts.

- [x] **Step 1: Record LSP 3.18 DocumentSymbol, SymbolKind, range, selectionRange, and UTF-16 decisions.**
- [x] **Step 2: Record official PlantUML declaration and alias syntax** from class, sequence, and deployment documentation.
- [x] **Step 3: Document supported and deliberately omitted syntax, limits, lifecycle, recovery, and privacy.**
- [x] **Step 4: Add the `Unreleased` CHANGELOG entry** without changing any package version.
- [x] **Step 5: Add repository tests** that require all documents, references, capability copy, naruon modularity, and current limits.
- [x] **Step 6: Commit** documentation and contracts.

### Task 5: Exact-head verification, review, and merge

**Files:**
- Test: complete repository and package surfaces.

**Interfaces:**
- Produces: one reviewable PR and no release.

- [ ] **Step 1: Run** `npm ci --ignore-scripts --no-audit --no-fund`.
- [ ] **Step 2: Run** `npm run verify` and require zero failures, zero skipped/todo tests, 100% production statement/branch/function coverage, complete production JSDoc, and syntax success.
- [ ] **Step 3: Run dry packs** for `packages/language-server` and `packages/language-server-stdio` and inspect every included path.
- [ ] **Step 4: Open one bounded PR** with exact evidence and APA 7 references.
- [ ] **Step 5: Address every actionable review thread**, rerun exact-head Node 22/24 CI, SAST, security, CodeRabbit, and package gates.
- [ ] **Step 6: Squash merge only when every current-head gate succeeds**, then verify the open PR queue again.
