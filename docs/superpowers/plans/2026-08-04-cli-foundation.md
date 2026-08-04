# DiagramWeave CLI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Every task must create a revision-bound patch or proposal against an exact target commit, review and validate that proposal without repository write credentials, and apply or commit it only after review completion. Steps use checkbox (`- [x]`) syntax for the completed implementation record.

**Goal:** Deliver `dweave validate` and `dweave render` as a deterministic, source-free, independently reusable CLI package for one PlantUML file or a recursively discovered directory.

**Architecture:** A pure parser creates an immutable command; a filesystem module iteratively discovers safe inputs and preflights output paths; an executor reuses the existing sandboxed renderer and aggregates per-file results; a presentation module serializes stable JSON and human output; a thin bin module maps the report to process streams and exit codes. Production uses Node.js built-ins, while tests inject bounded filesystem and renderer adapters.

**Tech Stack:** Node.js 22–24 ESM, built-in `node:fs/promises`, `node:path`, `node:crypto`, `node:test`, existing `@contextualwisdomlab/diagramweave-plantuml-renderer`.

## Global constraints

- Preserve source-first and manual-first behavior; the CLI performs no LLM call.
- Accept only `.puml` and `.plantuml` source files.
- Reject symbolic links and path escapes.
- Reject any output identical to an input source, even with `--overwrite`.
- Require explicit absolute Java and PlantUML JAR paths from arguments or documented environment variables.
- Never expose source, raw renderer diagnostics, Java/JAR paths, credentials, or unrelated absolute parent directories.
- Use exit codes `0` success, `1` diagram failure, and `2` invocation or operational failure.
- Keep runtime dependencies limited to existing DiagramWeave workspace packages and Node.js built-ins.
- Maintain Node.js `>=22 <25` compatibility.
- Maintain 100% production statement, branch, function, and production JSDoc coverage.
- Add no skipped or todo tests.
- Keep package versions at `0.0.0` and `CHANGELOG.md` under `Unreleased`.
- Introduce no database.

## Revision-bound review gate

The following gate applies before every task mutation:

- [x] Capture the exact target commit SHA and fail if the branch moves.
- [x] Produce a reviewable source patch or proposal bound to that SHA.
- [x] Review security boundaries, public contracts, tests, documentation, and package contents before application.
- [x] Run the task's focused validation without repository write credentials.
- [x] Apply and commit only the reviewed proposal.
- [x] Re-run exact-head repository checks after every mutation.

Temporary materialization inputs were removed from the published implementation commit. The final PR contains ordinary source, tests, package metadata, and durable documentation only.

---

### Task 1: Immutable CLI argument contract

**Files:**
- `packages/cli/package.json`
- `packages/cli/LICENSE`
- `packages/cli/src/errors.js`
- `packages/cli/src/arguments.js`
- `packages/cli/test/arguments.test.js`

**Interfaces:**
- Consumes `process.argv.slice(2)`-shaped string arrays and plain environment records.
- Produces `CliError`, `cliExitCodes`, and `parseCliArguments(argv, environment)` returning a deeply frozen command.

- [x] Write failing parser tests for exact valid forms, environment fallback, command-line precedence, SVG default, PNG, JSON, overwrite, help, unknown commands, missing or repeated values, incompatible options, controls, and relative renderer paths.
- [x] Verify the tests fail because the modules do not exist.
- [x] Implement stable source-free errors and a strict parser without global process reads.
- [x] Verify focused tests pass.
- [x] Review the revision-bound patch and commit `feat(cli): define deterministic command arguments`.

### Task 2: Safe input discovery and output planning

**Files:**
- `packages/cli/src/files.js`
- `packages/cli/test/files.test.js`

**Interfaces:**

```js
discoverDiagramInputs(inputPath, fileSystem)
planRenderOutputs(inputs, inputKind, outputPath, format, overwrite, fileSystem)
publishArtifact(destination, bytes, overwrite, fileSystem)
```

- [x] Write discovery tests for one file, recursive directory input, portable lexical ordering, supported extensions, unsupported direct input, empty directories, missing input, symlinks, non-regular files, duplicate identities, discovery races, and deep iterative traversal.
- [x] Write output tests for single and directory mapping, extension replacement, path escape, case-insensitive collisions, existing files, output symlinks, source/output identity, and attempts to overwrite the source path with `overwrite: true`.
- [x] Write publication tests for exclusive creation, atomic replacement, sync, cleanup after write/rename failure, and late output races.
- [x] Verify focused tests fail before implementation.
- [x] Implement iterative discovery and complete preflight before directory creation or renderer invocation.
- [x] Reject source/output identity independently of the overwrite flag.
- [x] Implement `open(path, 'wx')` for new files and same-directory temporary write, sync, close, and rename for explicit overwrite.
- [x] Verify focused tests pass.
- [x] Review the revision-bound patch and commit `feat(cli): discover and publish diagrams safely`.

### Task 3: Command execution, revision identity, and stable reports

**Files:**
- `packages/cli/src/execute.js`
- `packages/cli/src/presentation.js`
- `packages/cli/src/index.js`
- `packages/cli/test/execute.test.js`
- `packages/cli/test/presentation.test.js`
- `packages/cli/test/review-regressions.test.js`

**Interfaces:**

```js
executeDiagramWeaveCli(command, runtime)
formatCliReport(report, json)
runDiagramWeaveCli(argv, options)
```

- [x] Write execution tests for deterministic order, validate without publication, SVG/PNG propagation, mixed renderer failure, renderer construction failure, source read failure, invalid UTF-8, publication failure, malformed renderer artifacts, exact totals, partial publication, and frozen reports.
- [x] Write presentation tests for exact newline-terminated JSON and concise source-free human output.
- [x] Verify focused tests fail before implementation.
- [x] Decode source with `TextDecoder('utf-8', { fatal: true })` before renderer invocation.
- [x] Reuse the renderer's `sourceRevisionHash`; do not calculate a second CLI hash.
- [x] Use `sourceRevisionHash: null` when no trusted artifact exists.
- [x] Preserve a trusted renderer hash when rendering succeeded but publication failed.
- [x] Convert expected command failures into stable reports and unexpected failures into `internal_cli_error` without dynamic exception text.
- [x] Verify exact JSON fixtures for renderer construction, invalid UTF-8/input read, renderer failure, malformed artifact, and output publication failure.
- [x] Verify focused tests pass.
- [x] Review the revision-bound patch and commit `feat(cli): validate and render deterministic batches`.

## Operational result mapping

| Failure | Scope | Continue | Status | Exit | `sourceRevisionHash` | Publication |
|---|---|---:|---|---:|---|---|
| discovery or output planning | command | no | `invocation_failure` | `2` | no file result | none |
| renderer construction | command | no | `invocation_failure` | `2` | no file result | none |
| `input_read_failed` or invalid UTF-8 | file | yes | `invocation_failure` | `2` | `null` | none for failed file |
| renderer rejection | file | yes | `diagram_failure`, unless an operational failure exists | `1` or `2` | `null` | none for failed file |
| malformed artifact contract | file | yes | `invocation_failure` | `2` | `null` | none for failed file |
| `output_write_failed` after valid artifact | file | yes | `invocation_failure` | `2` | renderer hash | earlier successes remain published |

A preflight failure publishes nothing. After execution starts, successful earlier publications are not rolled back; the report is the partial-publication receipt.

### Exact regression fixtures

Renderer construction failure:

```json
{"schemaVersion":1,"command":"validate","status":"invocation_failure","exitCode":2,"format":null,"inputKind":null,"helpTopic":null,"errorCode":"renderer_unavailable","errorMessage":"Renderer unavailable.","totals":{"selected":0,"succeeded":0,"failed":0},"files":[]}
```

Invalid UTF-8:

```json
{"schemaVersion":1,"command":"validate","status":"invocation_failure","exitCode":2,"format":"svg","inputKind":"file","helpTopic":null,"errorCode":null,"errorMessage":null,"totals":{"selected":1,"succeeded":0,"failed":1},"files":[{"relativePath":"diagram.puml","status":"failed","sourceRevisionHash":null,"outputPath":null,"errorCode":"input_read_failed","errorMessage":"The diagram source could not be read as UTF-8."}]}
```

Publication failure after a valid renderer artifact:

```json
{"schemaVersion":1,"command":"render","status":"invocation_failure","exitCode":2,"format":"svg","inputKind":"file","helpTopic":null,"errorCode":null,"errorMessage":null,"totals":{"selected":1,"succeeded":0,"failed":1},"files":[{"relativePath":"diagram.puml","status":"failed","sourceRevisionHash":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","outputPath":"diagram.svg","errorCode":"output_write_failed","errorMessage":"The destination is read-only."}]}
```

### Task 4: Executable, packaging, documentation, and repository gates

**Files:**
- `packages/cli/src/bin.js`
- `packages/cli/README.md`
- `packages/cli/test/bin.test.js`
- `packages/cli/package.json`
- `package-lock.json`
- `README.md`
- `docs/architecture.md`
- `docs/product/diagramweave-prd.md`
- `CHANGELOG.md`
- `tests/repository-contract.test.js`

- [x] Write executable and repository-contract tests for help, invalid invocation, missing renderer configuration, JSON failures, stdout/stderr separation, exact exit codes, package bin/exports/files, documentation, architecture, PRD status, and changelog.
- [x] Verify focused tests fail before the executable and documentation exist.
- [x] Implement `src/bin.js` with no direct business logic and set `process.exitCode` from the report.
- [x] Add the `dweave` executable, public export, package files allowlist, and renderer dependency.
- [x] Update the package lock and all durable documentation.
- [x] Verify `npm ci`, full tests, 100% coverage, 100% production JSDoc, zero skipped/todo tests, and package dry run.
- [x] Review the revision-bound patch and commit `feat(cli): publish the dweave command foundation`.

### Task 5: PR evidence and release decision

**Files:**
- `docs/superpowers/plans/2026-08-04-cli-foundation.md`

- [x] Record exact test, coverage, JSDoc, syntax, and package evidence.
- [x] Re-run the exact final verification against the evidence-bearing tree.
- [x] Remove temporary materialization scripts, payloads, and workflows from the published tree.
- [x] Open one bounded pull request against `main`.
- [x] Keep versions at `0.0.0`; do not release before integrated product and real-runtime release gates exist.

## Final verification evidence

The exact clean implementation tree was verified before publication:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
223 tests passed
production line coverage: 100%
production branch coverage: 100%
production function coverage: 100%
production JSDoc modules: 17
JavaScript syntax files: 34
skipped/todo tests: 0
npm pack --workspace packages/cli --dry-run --json
packaged files: 10
```

The review-regression additions require the same exact-head gates to pass again before merge. Residual product limits remain explicit: no structured PlantUML line diagnostics, no Studio, no Language Server, no concurrent folder renderer, no formatting or policy command, and no bundled Java or PlantUML runtime. Versions remain `0.0.0` and the changelog remains under `Unreleased`.
