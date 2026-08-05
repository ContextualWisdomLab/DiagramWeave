# Language Server Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transport-neutral LSP 3.18 PlantUML diagnostic session reusable by DiagramWeave Studio, IDE adapters, naruon, and CWL hosts.

**Architecture:** Add one independently packable language-server workspace package. It owns protocol lifecycle, bounded full-document state, renderer invocation, exact version/generation binding, and safe diagnostic publication while leaving JSON-RPC framing and file access to host adapters.

**Tech Stack:** Node.js 22/24 ESM, Node test runner, existing DiagramWeave PlantUML renderer, LSP 3.18, RFC 3986, RFC 8089, RFC 8259.

## Global Constraints

- Production statement, branch, and function coverage must each be exactly 100%.
- Every production export and security boundary must have explanatory JSDoc.
- Skipped and todo tests are prohibited.
- No source, raw renderer output, raw host error, executable path, or credential may cross the public error or diagnostic boundary.
- The package must remain transport-neutral and independently reusable.
- The session must never dereference a document URI.
- Database objects are not introduced in this slice.
- Versions remain `0.0.0`; changes stay under `Unreleased`.

---

### Task 1: Contract and resource boundaries

**Files:**
- Create: `packages/language-server/src/errors.js`
- Create: `packages/language-server/src/limits.js`
- Create: `packages/language-server/src/contracts.js`
- Create: `packages/language-server/test/contracts.test.js`

**Interfaces:**
- Produces: `LanguageServerError`, `languageServerLimits`, and internal URI, text, version, language-ID, renderer-path, and plain-record validators.

- [x] **Step 1: Write failing tests** for local `.puml`/`.plantuml` file URIs, empty/localhost authority, remote authority refusal, credential/query/fragment refusal, 4 KiB URI limit, 1 MiB source limit, versions, language IDs, absolute renderer paths, and hostile prototypes.
- [x] **Step 2: Run** `node --test packages/language-server/test/contracts.test.js` and confirm the missing modules fail.
- [x] **Step 3: Implement minimal validators** with stable source-free errors and immutable limits.
- [x] **Step 4: Run the focused test** and confirm all contract cases pass.
- [x] **Step 5: Commit** `feat(language-server): define bounded document contracts`.

### Task 2: Diagnostic adapter

**Files:**
- Create: `packages/language-server/src/diagnostics.js`
- Create: `packages/language-server/test/diagnostics.test.js`

**Interfaces:**
- Consumes: `PlantUmlRendererError` and `sanitizePlantUmlDiagnostics`.
- Produces: internal `diagnosticsForRendererOutcome(error)`.

- [x] **Step 1: Write failing tests** for success, safe syntax diagnostics, caller mutation, locationless renderer errors, arbitrary thrown objects, and fixed operational diagnostics.
- [x] **Step 2: Run the focused test** and verify the missing adapter fails.
- [x] **Step 3: Implement exact-schema cloning** for renderer diagnostics and a fixed `diagramweave.renderer` fallback.
- [x] **Step 4: Run the focused test** and verify source-like thrown messages never appear.
- [x] **Step 5: Commit** `feat(language-server): adapt renderer diagnostics safely`.

### Task 3: Protocol-level session

**Files:**
- Create: `packages/language-server/src/session.js`
- Create: `packages/language-server/src/index.js`
- Create: `packages/language-server/test/session.test.js`

**Interfaces:**
- Consumes: contract validators and diagnostic adapter.
- Produces: `createLanguageServerSession(options)` with frozen `request`, `notify`, and `dispose` methods.

- [x] **Step 1: Write failing lifecycle tests** for initialize, initialized, shutdown, exit, unknown requests, unknown notifications, and work before readiness.
- [x] **Step 2: Write failing document tests** for open/change/close, full synchronization, monotonic versions, duplicate open, missing documents, and 256-document overflow.
- [x] **Step 3: Write failing concurrency tests** using deferred renderer promises to prove stale results disappear after change, close, shutdown, and disposal.
- [x] **Step 4: Write failing hostile-input tests** for top-level getters, proxy records, hostile change-array length, renderer getters, and notification failures.
- [x] **Step 5: Implement the minimal session** with exact record/generation checks and fixed notifications.
- [x] **Step 6: Run** `node --test packages/language-server/test/session.test.js` and confirm all cases pass.
- [x] **Step 7: Commit** `feat(language-server): add transport-neutral diagnostic session`.

### Task 4: Package and durable documentation

**Files:**
- Create: `packages/language-server/package.json`
- Create: `packages/language-server/LICENSE`
- Create: `packages/language-server/README.md`
- Create: `packages/language-server/test/package-contract.test.js`
- Create: `docs/research/language-server-foundation.md`
- Create: `docs/operations/language-server.md`
- Create: `docs/product/language-server-foundation.md`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: independently packable `@contextualwisdomlab/diagramweave-language-server` and APA 7 standards traceability.

- [x] **Step 1: Write failing package-contract tests** for name, exports, files, engines, dependency, public API surface, license, and documentation.
- [x] **Step 2: Add package metadata and documentation** with the LSP 3.18, RFC 3986, RFC 8089, and RFC 8259 decisions and explicit deferred scope.
- [x] **Step 3: Add the workspace lock entries** for the package and its renderer dependency.
- [x] **Step 4: Add the `Unreleased` changelog entry** without changing version numbers.
- [x] **Step 5: Run** `npm pack --workspace packages/language-server --dry-run --json` and reject any file outside `LICENSE`, `README.md`, `package.json`, and `src/*.js`.
- [x] **Step 6: Commit** `docs(language-server): publish foundation contracts`.

### Task 5: Exact repository gates and PR

**Files:**
- Test: all repository tests and production modules.

**Interfaces:**
- Consumes: final package and documentation tree.
- Produces: one reviewable pull request; no release or direct publication.

- [ ] **Step 1: Run** `npm ci --ignore-scripts --no-audit --no-fund` on the complete repository tree.
- [ ] **Step 2: Run** `npm run verify` and require zero failures, zero skipped/todo tests, 100% production statement/branch/function coverage, complete production JSDoc, and syntax success.
- [ ] **Step 3: Run the language-server package dry run** and inspect every packaged path on the complete repository tree.
- [ ] **Step 4: Push one bounded branch and open one PR** with the exact verification evidence and standards references.
- [ ] **Step 5: Address every actionable review thread, rerun exact-head CI/SAST/security checks, and squash merge only when all gates and CodeRabbit succeed.**
