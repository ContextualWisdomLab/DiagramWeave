# DiagramWeave Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a zero-dependency, source-first DiagramWeave foundation that safely validates and applies LLM edit proposals and uses Contextual Orchestrator as the default provider adapter.

**Architecture:** A small npm workspace separates a pure `@contextualwisdomlab/diagramweave-core` package from a provider-specific `@contextualwisdomlab/diagramweave-contextual-orchestrator` adapter. The core owns document revision hashes, edit-proposal validation, scope-expansion approval, and deterministic application; the adapter owns HTTP policy, context limits, request construction, response extraction, and core validation. Repository workflows delegate PR governance to the organization-central reusable workflows and create at most one hourly product-development Agent Task when the PR queue is empty.

**Tech Stack:** Node.js 22/24 LTS, ECMAScript modules, Node built-in test runner and coverage, npm workspaces, GitHub Actions, Contextual Orchestrator OpenAI-compatible API.

## Global Constraints

- Initial diagram language is PlantUML, but the core must not hard-code a renderer or UI.
- Manual editing must remain usable without an account, internet connection, or LLM.
- Source files are authoritative; AI output is always an untrusted proposal.
- AI changes require revision, range, policy, and explicit scope-expansion checks before application.
- Contextual Orchestrator is the default remote adapter; provider credentials are never logged or persisted by this package.
- Production statement, branch, and function coverage must remain 100%.
- Production exported modules, classes, functions, methods, properties, inputs, outputs, exceptions, and security boundaries require beginner-readable JSDoc.
- Database objects, if introduced later, must use descriptive two-word-or-longer `snake_case` names.
- New code must remain independently usable and composable with ContextualWisdomLab/.github, naruon, and other CWL services.
- No release is published from this plan; CHANGELOG remains under `Unreleased` until an integrated release candidate exists.

---

### Task 1: Bootstrap repository contracts and quality gates

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CHANGELOG.md`
- Create: `AGENTS.md`
- Create: `SECURITY.md`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `scripts/check-docstrings.mjs`
- Create: `tests/repository-contract.test.js`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: None.
- Produces: root npm scripts `test`, `coverage`, `docstrings`, `syntax`, and `verify`; a repository contract that later packages must satisfy.

- [ ] **Step 1: Write failing repository contract tests**
- [ ] **Step 2: Run the contract tests and confirm missing files fail**
- [ ] **Step 3: Add the minimal repository files and quality scripts**
- [ ] **Step 4: Run repository contract, syntax, and docstring checks**
- [ ] **Step 5: Commit the bootstrap contract**

### Task 2: Implement revision-safe edit proposals in the core package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/src/errors.js`
- Create: `packages/core/src/revision.js`
- Create: `packages/core/src/edit-proposal.js`
- Create: `packages/core/src/index.js`
- Create: `packages/core/test/revision.test.js`
- Create: `packages/core/test/edit-proposal.test.js`

**Interfaces:**
- Consumes: Node `crypto` only.
- Produces: `hashSource(source)`, `validateEditProposal(proposal, source)`, `previewEditProposal(source, proposal, options)`, `applyEditProposal(source, proposal, options)`, and typed error classes with stable `code` values.

- [ ] **Step 1: Write failing tests for deterministic revisions and strict proposal validation**
- [ ] **Step 2: Run core tests and confirm missing-module failures**
- [ ] **Step 3: Implement the minimal revision and proposal code**
- [ ] **Step 4: Run focused core tests and 100% coverage**
- [ ] **Step 5: Commit the core package**

### Task 3: Implement the Contextual Orchestrator adapter

**Files:**
- Create: `packages/contextual-orchestrator/package.json`
- Create: `packages/contextual-orchestrator/src/client.js`
- Create: `packages/contextual-orchestrator/src/index.js`
- Create: `packages/contextual-orchestrator/test/client.test.js`

**Interfaces:**
- Consumes: `validateEditProposal` from `@contextualwisdomlab/diagramweave-core`, standard `fetch`, `AbortController`, and an operator-supplied token.
- Produces: `createContextualOrchestratorClient(options)` with `requestEditProposal(request)` and exported helpers `buildEditProposalMessages(request)` and `extractAssistantJson(content)`.

- [ ] **Step 1: Write failing adapter tests for URL policy, limits, request shape, timeout, HTTP errors, JSON extraction, and validated proposals**
- [ ] **Step 2: Run adapter tests and confirm missing-module failures**
- [ ] **Step 3: Implement the minimal adapter**
- [ ] **Step 4: Run focused adapter tests and full 100% coverage**
- [ ] **Step 5: Commit the adapter package**

### Task 4: Add architecture, security, product, and operations documentation

**Files:**
- Create: `docs/product/diagramweave-prd.md`
- Create: `docs/architecture.md`
- Create: `docs/security-model.md`
- Create: `docs/operations/contextual-orchestrator.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Public APIs from Tasks 2 and 3.
- Produces: source-first architecture and explicit trust boundaries for renderer, LLM context, proposal validation, naruon/CWL reuse, and future Studio work.

- [ ] **Step 1: Extend repository contract tests for required documentation and terminology**
- [ ] **Step 2: Run tests and confirm documentation assertions fail**
- [ ] **Step 3: Write the documentation and PRD copy**
- [ ] **Step 4: Run documentation contracts and full verification**
- [ ] **Step 5: Commit documentation**

### Task 5: Install pull-request-first hourly governance

**Files:**
- Create: `.github/workflows/hourly-pr-maintenance.yml`
- Create: `.github/workflows/hourly-product-development.yml`
- Create: `tests/workflow-contract.test.js`
- Create: `docs/operations/hourly-development.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: organization-central `pr-review-fix-scheduler` repository-dispatch contract, immutable `pr-review-merge-scheduler.yml` reusable workflow, GitHub Agent Tasks API, `CWL_AUTOMATION_TOKEN`, and `COPILOT_GITHUB_TOKEN`.
- Produces: hourly review/fix/revalidate/merge scheduling and exactly-one bounded product-development task when no open PR or active task exists.

- [ ] **Step 1: Write failing workflow contract tests**
- [ ] **Step 2: Run tests and confirm workflows are absent**
- [ ] **Step 3: Add central PR maintenance and fail-closed product-development workflows**
- [ ] **Step 4: Run workflow contract tests and full verification**
- [ ] **Step 5: Commit governance workflows**

### Task 6: Final verification and publication

**Files:**
- Modify only files required by verification findings.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one reviewable foundation pull request against `main` with exact local verification evidence.

- [ ] **Step 1: Run `npm run verify` on Node 22**
- [ ] **Step 2: Inspect coverage and docstring results for exact 100% gates**
- [ ] **Step 3: Scan for placeholders, secret-like values, unsafe workflow refs, and database naming violations**
- [ ] **Step 4: Create a bounded GitHub pull request and inspect current-head checks and review threads**
- [ ] **Step 5: Address valid feedback, revalidate the exact head, and merge only when repository policy permits**
