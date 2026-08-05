# Language Server Stdio Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DiagramWeave Language Server launchable through a bounded, source-free LSP JSON-RPC stdio process.

**Architecture:** A new workspace package owns framing, JSON-RPC validation, sequential dispatch, output serialization, Node stream adaptation, and one executable. It delegates all document lifecycle and diagnostics to the existing transport-neutral session.

**Tech Stack:** Node.js 22/24 ESM, Node test runner, LSP 3.18, JSON-RPC 2.0, RFC 8259.

## Global constraints

- 100% production statement, branch, and function coverage.
- Complete production JSDoc and zero skipped/todo tests.
- No source, protocol body, raw error, path, environment value, or credential in logs or public errors.
- No weakening of central CI, security, review, scheduler, or release gates.
- No database objects and no version increase in this slice.

### Task 1: Frame reader

- [x] Write failing split, combined, malformed, oversized, duplicate-header, hostile-byte, flood, and EOF tests.
- [x] Verify the missing reader fails.
- [x] Implement bounded ASCII Content-Length framing.
- [x] Verify focused tests and commit the reviewed increment.

### Task 2: Strict JSON-RPC codec

- [x] Write failing UTF-8, JSON, object, member, method, params, ID, response, and encoding tests.
- [x] Verify failures are caused by the missing contract.
- [x] Implement strict request/notification parsing and fixed response encoding.
- [x] Verify focused tests and commit the reviewed increment.

### Task 3: Connection and lifecycle

- [x] Write failing request, notification, session-error, protocol-error, graceful-exit, output-failure, ordering, queue, and hostile-options tests.
- [x] Implement one sequential connection around the existing session.
- [x] Verify real-session integration and exact source-free responses.

### Task 4: Stdio process and executable

- [x] Write failing Node-stream, callback, EOF, input-error, pause/resume, configuration, and exit-code tests.
- [x] Implement explicit process adapters and `dweave-lsp`.
- [x] Verify the runner removes listeners and never calls process.exit.

### Task 5: Documentation, package, and repository gates

- [x] Add package/readme/license/bin contracts and APA 7 standards record.
- [x] Update package lock, root docs, and Unreleased changelog.
- [x] Run isolated tests and require exact 100% line/branch/function coverage.
- [x] Run package dry-run and inspect every included path.
- [ ] Run full-repository `npm ci`, `npm run verify`, Node 22/24, SAST, security, CodeRabbit, and package gates on the exact PR head.
- [ ] Address all review findings and squash merge only when every gate succeeds.
