# Structured PlantUML Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse PlantUML `-stdrpt:1` output once at the renderer boundary and propagate safe immutable line diagnostics through renderer errors and CLI reports.

**Architecture:** A pure `diagnostics.js` module owns the bounded protocol parser. The renderer consumes its result and attaches only frozen product-defined diagnostics to `PlantUmlRendererError`; the CLI validates and copies those records into per-file reports and deterministic human output. Raw stderr and raw labels never cross the renderer boundary.

**Tech Stack:** Node.js 22–24 ESM, built-in `TextDecoder`, `node:test`, existing DiagramWeave renderer and CLI packages.

## Global Constraints

- Work only on `agent/structured-diagnostics`, never directly on `main`.
- Before each production change, record the current branch revision, create the failing test commit, and verify the failure is caused by the missing behavior.
- Apply production changes only against that reviewed revision; if the branch moves, regenerate the proposal.
- Keep production statement, branch, and function coverage at exactly 100%.
- Keep production JSDoc coverage at 100%; every new module and exported symbol requires beginner-readable documentation.
- Do not add runtime dependencies.
- Do not expose source, raw stderr, raw PlantUML labels, Java paths, JAR paths, credentials, or provider messages.
- Keep package versions at `0.0.0` and document changes under `Unreleased`.
- Do not skip or mark tests todo.
- References in durable documentation use APA 7th edition.

## File map

- Create `packages/plantuml-renderer/src/diagnostics.js`: strict pure parser and immutable diagnostic factory.
- Create `packages/plantuml-renderer/test/diagnostics.test.js`: official-example, malformed, privacy, and boundary corpus.
- Modify `packages/plantuml-renderer/src/index.js`: export parser.
- Modify `packages/plantuml-renderer/src/errors.js`: clone and freeze diagnostic arrays.
- Modify `packages/plantuml-renderer/src/renderer.js`: consume parser and attach diagnostics to failures.
- Modify `packages/plantuml-renderer/test/review-regressions.test.js`: renderer integration and source-leak regressions.
- Modify `packages/cli/src/execute.js`: validate, clone, freeze, and propagate diagnostics.
- Modify `packages/cli/src/presentation.js`: deterministic location-aware human output.
- Modify `packages/cli/test/execute.test.js` and `packages/cli/test/presentation.test.js`: JSON and text contracts.
- Modify package and product documentation, architecture, PRD, repository contracts, and CHANGELOG.

---

### Task 1: Pure PlantUML standard-report parser

**Files:**
- Create: `packages/plantuml-renderer/test/diagnostics.test.js`
- Create: `packages/plantuml-renderer/src/diagnostics.js`
- Modify: `packages/plantuml-renderer/src/index.js`

**Interfaces:**
- Consumes: bounded `Buffer` stderr bytes already collected by the renderer.
- Produces: `parsePlantUmlStandardReport(diagnostics: Buffer)` returning the exact immutable shape in the design.

- [ ] **Step 1: Commit failing parser tests**

Create tests for the official error example, CRLF success, missing line, unknown label, duplicate fields, malformed/overflow line numbers, unsupported protocol versions, contradictory fields, empty reports, narrative decoys, and invalid UTF-8. The official example assertion is:

```js
assert.deepEqual(
  parsePlantUmlStandardReport(Buffer.from([
    'protocolVersion=1',
    'status=ERROR',
    'lineNumber=2',
    'label=Syntax Error?',
    'Error line 2 in file: file1.pu',
    'Some diagram description contains errors',
    '',
  ].join('\n'))),
  {
    protocolVersion: 1,
    status: 'error',
    diagnostic: {
      schemaVersion: 1,
      source: 'plantuml',
      severity: 'error',
      code: 'plantuml_syntax_error',
      message: 'PlantUML reported a syntax error.',
      lineNumber: 2,
      columnNumber: null,
    },
  },
);
```

Also assert both the outer result and nested diagnostic are frozen, and assert an unknown label string never appears in `JSON.stringify(result)`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test packages/plantuml-renderer/test/diagnostics.test.js
```

Expected: failure because `parsePlantUmlStandardReport` is not exported.

- [ ] **Step 3: Implement the minimal parser**

Implement:

```js
export function parsePlantUmlStandardReport(diagnostics) {
  // fatal UTF-8 decode; collect exact recognized key lines; reject duplicates;
  // validate protocol/status/line; map labels to fixed product records;
  // return frozen { protocolVersion, status, diagnostic }.
}
```

Exact product messages:

```js
const syntaxMessage = 'PlantUML reported a syntax error.';
const genericMessage = 'PlantUML reported a diagram error.';
```

Narrative lines and unknown fields are ignored without being retained. `status=OK` with `lineNumber` or a nonempty `label` is invalid. `status=ERROR` may omit `lineNumber` and label.

- [ ] **Step 4: Verify GREEN and coverage**

Run:

```bash
node --test packages/plantuml-renderer/test/diagnostics.test.js
npm run coverage
npm run docstrings
```

Expected: parser tests pass and all quality thresholds remain 100%.

- [ ] **Step 5: Commit**

```bash
git add packages/plantuml-renderer/src/diagnostics.js \
  packages/plantuml-renderer/src/index.js \
  packages/plantuml-renderer/test/diagnostics.test.js
git commit -m "feat(renderer): parse safe PlantUML diagnostics"
```

---

### Task 2: Renderer error propagation

**Files:**
- Modify: `packages/plantuml-renderer/src/errors.js`
- Modify: `packages/plantuml-renderer/src/renderer.js`
- Modify: `packages/plantuml-renderer/test/review-regressions.test.js`

**Interfaces:**
- Consumes: `parsePlantUmlStandardReport(Buffer)` from Task 1.
- Produces: `PlantUmlRendererError.diagnostics`, always a deeply frozen array of safe records.

- [ ] **Step 1: Commit failing renderer tests**

Extend the ERROR-report test to assert:

```js
assert.deepEqual(error.diagnostics, [{
  schemaVersion: 1,
  source: 'plantuml',
  severity: 'error',
  code: 'plantuml_syntax_error',
  message: 'PlantUML reported a syntax error.',
  lineNumber: 2,
  columnNumber: null,
}]);
assert.equal(Object.isFrozen(error.diagnostics), true);
assert.equal(Object.isFrozen(error.diagnostics[0]), true);
```

Add regressions proving an unknown label is not exposed, invalid reports produce `diagnostics: []`, and mutating the original details array after error construction cannot mutate the error.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test packages/plantuml-renderer/test/review-regressions.test.js
```

Expected: failure because renderer errors do not expose diagnostics.

- [ ] **Step 3: Implement renderer propagation**

Replace `inspectStandardReport()` usage with the Task 1 parser. On a valid error status, pass the single diagnostic to `PlantUmlRendererError`; on invalid or non-report failures, pass an empty array. Extend the error constructor details type to include `diagnostics?: readonly object[]`, clone each supported primitive field into a new frozen record, and freeze the resulting array.

- [ ] **Step 4: Verify GREEN and full quality**

Run:

```bash
node --test packages/plantuml-renderer/test/review-regressions.test.js
npm run verify
```

Expected: all tests pass, no skipped/todo tests, and production line/branch/function/docstring coverage remains 100%.

- [ ] **Step 5: Commit**

```bash
git add packages/plantuml-renderer/src/errors.js \
  packages/plantuml-renderer/src/renderer.js \
  packages/plantuml-renderer/test/review-regressions.test.js
git commit -m "feat(renderer): expose source-free line diagnostics"
```

---

### Task 3: CLI JSON propagation and immutable report contract

**Files:**
- Modify: `packages/cli/src/execute.js`
- Modify: `packages/cli/test/execute.test.js`

**Interfaces:**
- Consumes: renderer errors with optional frozen `diagnostics`.
- Produces: every report and file record with a deeply frozen `diagnostics` array.

- [ ] **Step 1: Commit failing CLI execution tests**

Add an exact renderer-failure fixture with one safe diagnostic and assert it appears unchanged in the file result. Add tests for:

```js
assert.deepEqual(report.diagnostics, []);
assert.deepEqual(report.files[0].diagnostics, expectedDiagnostics);
assert.equal(Object.isFrozen(report.diagnostics), true);
assert.equal(Object.isFrozen(report.files[0].diagnostics), true);
assert.equal(Object.isFrozen(report.files[0].diagnostics[0]), true);
```

Also prove input-read, output-write, help, and invocation failures have empty arrays; malformed diagnostics, extra keys, raw labels, source excerpts, negative lines, or non-product messages are discarded.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test packages/cli/test/execute.test.js
```

Expected: failure because report records do not own diagnostics.

- [ ] **Step 3: Implement safe CLI cloning**

Add a private `safeDiagnostics(error)` helper that accepts only records with the exact keys and values allowed by the design. Clone accepted records, freeze them, and never retain renderer-owned objects. Extend `freezeReport`, `createInvocationReport`, `createHelpReport`, `failedFile`, and successful file results with diagnostic arrays.

- [ ] **Step 4: Verify GREEN and coverage**

Run:

```bash
node --test packages/cli/test/execute.test.js
npm run coverage
npm run docstrings
```

Expected: tests pass and all thresholds remain 100%.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/execute.js packages/cli/test/execute.test.js
git commit -m "feat(cli): propagate structured renderer diagnostics"
```

---

### Task 4: Human-readable diagnostic output

**Files:**
- Modify: `packages/cli/src/presentation.js`
- Modify: `packages/cli/test/presentation.test.js`

**Interfaces:**
- Consumes: per-file diagnostic records from Task 3.
- Produces: deterministic indented `path:line` or `path:?` diagnostic lines.

- [ ] **Step 1: Commit failing presentation tests**

Add exact assertions for:

```text
FAIL flows/checkout.puml [renderer_failed] PlantUML rejected the source or failed to render it.
  flows/checkout.puml:2 ERROR [plantuml_syntax_error] PlantUML reported a syntax error.
```

and:

```text
  flows/checkout.puml:? ERROR [plantuml_error] PlantUML reported a diagram error.
```

Assert successful files and failures without diagnostics do not add blank or placeholder lines. JSON output must remain exactly `JSON.stringify(report) + "\n"`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test packages/cli/test/presentation.test.js
```

Expected: failure because diagnostics are not formatted.

- [ ] **Step 3: Implement formatting**

After each `FAIL` line, append one line per diagnostic using the file's safe relative path, `lineNumber ?? '?'`, uppercase severity, code, and product message. Do not derive or print source excerpts.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test packages/cli/test/presentation.test.js
npm run verify
```

Expected: all tests and quality gates pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/presentation.js packages/cli/test/presentation.test.js
git commit -m "feat(cli): print line-addressable diagnostics"
```

---

### Task 5: Durable documentation, contracts, and release evidence

**Files:**
- Modify: `packages/plantuml-renderer/README.md`
- Modify: `docs/operations/plantuml-renderer.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `docs/architecture.md`
- Modify: `CHANGELOG.md`
- Modify: `tests/repository-contract.test.js`

**Interfaces:**
- Consumes: final public parser, error, and CLI report contracts.
- Produces: buyer-facing usage and repository-enforced documentation evidence.

- [ ] **Step 1: Commit failing documentation-contract tests**

Require the durable docs to contain:

- `parsePlantUmlStandardReport`;
- `plantuml_syntax_error`;
- `lineNumber` and `columnNumber`;
- the statement that raw stderr and raw labels are never exposed;
- the exact human `relative/path.puml:2 ERROR` form;
- the APA 7 PlantUML reference.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/repository-contract.test.js
```

Expected: failure because durable docs do not yet describe the contract.

- [ ] **Step 3: Update documentation and CHANGELOG**

Document the exact diagnostic record, privacy boundary, CLI JSON/human examples, and reuse by Studio/Language Server/naruon. Mark FR-023's structured line/type/severity foundation as implemented while retaining richer parser-aware diagnostics as future work. Add an `Unreleased` changelog item. Keep versions at `0.0.0`.

Use these APA 7 references:

```text
PlantUML. (2026). Command-line usage: Standard report (stdrpt). https://plantuml.com/command-line

OASIS Open. (2020). Static Analysis Results Interchange Format (SARIF) Version 2.1.0. https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
```

- [ ] **Step 4: Verify full repository and package artifacts**

Run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm pack --workspace packages/plantuml-renderer --dry-run --json
npm pack --workspace packages/cli --dry-run --json
```

Expected:

- all tests pass;
- production line, branch, and function coverage are 100%;
- production JSDoc coverage is 100%;
- skipped and todo tests are zero;
- both packages contain only LICENSE, README, package metadata, and intended `src/*.js` files.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md docs packages tests/repository-contract.test.js
git commit -m "docs: publish structured diagnostics contract"
```

---

### Task 6: Review, exact-head checks, and merge handoff

**Files:**
- Review all branch changes.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: one bounded pull request against `main`.

- [ ] **Step 1: Self-review the complete diff**

Confirm there is no raw stderr, raw label, source excerpt, hidden payload, temporary workflow, unexpected dependency, placeholder, or unrelated refactor.

- [ ] **Step 2: Re-run verification on the exact branch head**

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm pack --workspace packages/plantuml-renderer --dry-run --json
npm pack --workspace packages/cli --dry-run --json
```

- [ ] **Step 3: Open one pull request**

Use title:

```text
feat: add structured PlantUML diagnostics
```

The body must list the official standard-report fixture, test count, exact 100% coverage, docstring result, package dry runs, privacy guarantees, residual limits, and release decision.

- [ ] **Step 4: Process the PR loop**

Review every inline thread, implement all valid fixes test-first, rerun exact-head CI/SAST/security checks, and merge only when the latest head is mergeable, all threads are resolved, CodeRabbit succeeds, and required checks succeed.
