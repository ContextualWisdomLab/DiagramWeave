# Deterministic PlantUML Declaration Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, deterministic LSP 3.18 PlantUML declaration completion to the transport-neutral Language Server and real stdio process.

**Architecture:** Compose a completion session over the existing document-symbol session. Keep candidate generation in a pure source-and-position function, own only sanitized full-document completion snapshots, and delegate diagnostics, document symbols, rendering, lifecycle, and transport to existing modules.

**Tech Stack:** Node.js 22/24, ECMAScript modules, built-in `node:test`, LSP 3.18, JSON-RPC 2.0, GitHub Actions.

## Global Constraints

- Production source remains under `packages/**/src/*.js` with no runtime dependency addition.
- Source snapshots are limited to 1 MiB UTF-8 and completion results to 64 items.
- LSP positions are UTF-16 code units.
- Completion performs no LLM call, renderer call, file read, URI dereference, include or macro evaluation, shell execution, or network request.
- Returned collections, items, ranges, positions, and edits are immutable.
- Production line, branch, and function coverage must each be 100%.
- Production modules and public production symbols must have complete JSDoc.
- Node.js 22 and 24, SAST, Security Scan, CodeRabbit, and review-thread gates must pass on one exact head before merge.
- Package versions remain `0.0.0` under `CHANGELOG.md` `Unreleased`; this slice does not publish a release.

---

### Task 1: Pure declaration completion engine

**Files:**
- Create: `packages/language-server/src/completions.js`
- Create: `packages/language-server/test/completions.test.js`
- Modify: `packages/language-server/src/limits.js`
- Modify: `packages/language-server/test/contracts.test.js`

**Interfaces:**
- Consumes: `isPlainRecord`, `LanguageServerError`, and `languageServerLimits.maxDocumentBytes`.
- Produces: `completionItemsForSource(source: unknown, completionPosition: unknown): readonly Readonly<object>[]` and `languageServerLimits.maxCompletionItems`.

- [x] **Step 1: Write failing catalog, filtering, range, suppression, error, immutability, and UTF-16 tests.**
- [x] **Step 2: Run `node --test packages/language-server/test/completions.test.js` and confirm the missing module or export fails.**
- [x] **Step 3: Implement a fixed catalog, comment-state scanner, position validator, line-leading prefix matcher, exact text edits, deterministic ordering, and shared empty result.**
- [x] **Step 4: Run the focused test and confirm all cases pass without skipped tests.**
- [x] **Step 5: Commit the engine, tests, and public result limit.**

### Task 2: Transport-neutral completion session

**Files:**
- Create: `packages/language-server/src/completion-session.js`
- Create: `packages/language-server/test/completion-session.test.js`
- Modify: `packages/language-server/src/index.js`
- Modify: `tests/document-symbol-repository-contract.test.js`
- Test directly: `packages/language-server/test/symbol-session.test.js`

**Interfaces:**
- Consumes: `createDocumentSymbolLanguageServerSession(options)` and `completionItemsForSource(source, position)`.
- Produces: `createCompletionLanguageServerSession(options)` exported publicly as `createLanguageServerSession`.

- [x] **Step 1: Write failing initialize capability, lifecycle, open/change/close, malformed parameter, hostile position, and invalidation tests.**
- [x] **Step 2: Run the focused session test and confirm completion is not yet advertised or served.**
- [x] **Step 3: Implement capability negotiation, frozen parameter normalization, latest-source ownership, epoch/sequence ordering, and completion request dispatch.**
- [x] **Step 4: Point the package entry point at the completion session while preserving the public session factory name.**
- [x] **Step 5: Import the document-symbol session directly in its unit test so every composed layer retains independent branch evidence.**
- [x] **Step 6: Add a hostile initialize-capability getter case and verify the server omits completion without leaking the exception.**
- [x] **Step 7: Run completion, document-symbol, diagnostic-session, and repository-contract tests.**
- [x] **Step 8: Commit the composed session and direct layer coverage.**

### Task 3: JSON-RPC stdio integration

**Files:**
- Modify: `packages/language-server-stdio/src/json-rpc.js`
- Create: `packages/language-server-stdio/test/completion-error.test.js`
- Create: `packages/language-server-stdio/test/completion.test.js`

**Interfaces:**
- Consumes: the existing `createLanguageServerStdioConnection` and public Language Server session.
- Produces: a complete `dweave-lsp` initialize/open/completion/shutdown/exit round trip and `-32602` mapping for `document_position_invalid`.

- [x] **Step 1: Write a failing error-mapping test for `document_position_invalid`.**
- [x] **Step 2: Add the stable code to the JSON-RPC invalid-parameter family and run the focused mapping test.**
- [x] **Step 3: Write a real framed stdio test that initializes with completion support, opens `  com`, requests completion, and asserts the exact `component` text edit.**
- [x] **Step 4: Run the stdio completion test and the full stdio package tests.**
- [x] **Step 5: Commit the protocol integration.**

### Task 4: Regression and exact coverage repair

**Files:**
- Modify: `packages/language-server/test/completion-session.test.js`
- Modify: `packages/language-server/test/completions.test.js`
- Modify: `packages/language-server/test/symbol-session.test.js`

**Interfaces:**
- Consumes: exact uncovered line reports from Node's built-in coverage runner.
- Produces: 100% production line, branch, and function coverage without deleting reachable safeguards or accepting failures.

- [x] **Step 1: Correct the missing-position expectation to `document_position_invalid`.**
- [x] **Step 2: Replace the invalid `st|ate` fixture with a true partial keyword `st| Done`.**
- [x] **Step 3: Exercise the capability-probe catch branch with a hostile getter.**
- [x] **Step 4: Exercise document-symbol normalization through its direct factory rather than only through the outer completion wrapper.**
- [ ] **Step 5: Run `npm run coverage` on the current head and confirm every production file reports 100.00/100.00/100.00.**
- [ ] **Step 6: If any line remains uncovered, add a behavior-preserving test for that exact reachable contract and rerun coverage.**

### Task 5: Standards, product, and operations records

**Files:**
- Create: `docs/research/plantuml-declaration-completion.md`
- Create: `docs/operations/declaration-completion.md`
- Create: `docs/product/declaration-completion.md`
- Create: `docs/superpowers/specs/2026-08-05-declaration-completion-design.md`
- Create: `docs/superpowers/plans/2026-08-05-declaration-completion.md`
- Modify: `packages/language-server/README.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `CHANGELOG.md`
- Create: `tests/declaration-completion-repository-contract.test.js`

**Interfaces:**
- Consumes: the implemented public protocol, LSP 3.18, JSON-RPC 2.0, and official PlantUML syntax documentation.
- Produces: durable APA 7th traceability, host instructions, product boundaries, architecture decisions, and executable documentation contracts.

- [x] **Step 1: Record LSP, JSON-RPC, and official PlantUML sources in APA 7th form.**
- [x] **Step 2: Document activation, lifecycle, limits, privacy, troubleshooting, and verification.**
- [x] **Step 3: Document the buyer-visible outcome, exclusions, acceptance criteria, modular fit, and Figma gate.**
- [x] **Step 4: Commit the design and implementation records after scanning for placeholders, contradictions, and scope expansion.**
- [ ] **Step 5: Update existing package, root, architecture, PRD, and changelog records.**
- [ ] **Step 6: Add repository-contract tests for files, protocol terms, limits, APA references, modular hosts, and release status.**
- [ ] **Step 7: Run the repository-contract test and full verification.**

### Task 6: Package and exact-head verification

**Files:**
- Verify: `package.json`
- Verify: `packages/language-server/package.json`
- Verify: `packages/language-server-stdio/package.json`
- Verify: `package-lock.json`

**Interfaces:**
- Consumes: the completed source, tests, and documentation tree.
- Produces: reproducible package manifests and merge evidence for one immutable head SHA.

- [ ] **Step 1: Run `npm ci --ignore-scripts --no-audit --no-fund`.**
- [ ] **Step 2: Run `npm run verify` and record test count, zero skipped tests, 100% coverage, syntax count, and JSDoc count.**
- [ ] **Step 3: Run `npm pack --workspace packages/language-server --dry-run --json` and verify only documented package files appear.**
- [ ] **Step 4: Run `npm pack --workspace packages/language-server-stdio --dry-run --json` and verify only documented `bin` and `src` surfaces appear.**
- [ ] **Step 5: Confirm CI passes on Node.js 22 and 24 for the same head.**
- [ ] **Step 6: Confirm SAST Semgrep, Security Scan, CodeRabbit, and all review threads succeed or resolve on that head.**

### Task 7: Pull request completion and queue continuation

**Files:**
- Update: pull request `#10` description and draft state.

**Interfaces:**
- Consumes: exact-head verification evidence and repository protection rules.
- Produces: one squash merge or a precise remaining blocker, followed by a refreshed PR queue.

- [ ] **Step 1: Update the PR description with exact head SHA, complete verification evidence, standards record, and explicit non-release status.**
- [ ] **Step 2: Mark the PR ready only after all implementation and documentation tasks are complete.**
- [ ] **Step 3: Re-read PR metadata, review threads, workflow runs, and combined status to ensure the head has not changed.**
- [ ] **Step 4: Squash merge with `expected_head_sha` fixed to the verified head; do not bypass protection.**
- [ ] **Step 5: Search the repository for remaining open PRs.**
- [ ] **Step 6: If the queue is empty, select the next bounded buyer-visible gap and begin a new spec, TDD plan, branch, and draft PR.**
