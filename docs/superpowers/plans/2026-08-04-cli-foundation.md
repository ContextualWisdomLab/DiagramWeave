# DiagramWeave CLI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `dweave validate` and `dweave render` as a deterministic, source-free, independently reusable CLI package for one PlantUML file or a recursively discovered directory.

**Architecture:** A pure parser creates an immutable command; a filesystem module iteratively discovers safe inputs and preflights output paths; an executor reuses the existing sandboxed renderer and aggregates per-file results; a presentation module serializes stable JSON and human output; a thin bin module maps the report to process streams and exit codes. Production uses Node.js built-ins, while tests inject bounded filesystem and renderer adapters.

**Tech Stack:** Node.js 22–24 ESM, built-in `node:fs/promises`, `node:path`, `node:crypto`, `node:test`, existing `@contextualwisdomlab/diagramweave-plantuml-renderer`.

## Global Constraints

- Preserve source-first and manual-first behavior; the CLI performs no LLM call.
- Accept only `.puml` and `.plantuml` source files.
- Reject symbolic links and path escapes.
- Require explicit absolute Java and PlantUML JAR paths from arguments or the documented environment variables.
- Never expose source, raw renderer diagnostics, Java/JAR paths, or unrelated absolute parent directories.
- Use exit codes `0` success, `1` diagram failure, and `2` invocation or operational failure.
- Keep runtime dependencies limited to existing DiagramWeave workspace packages and Node.js built-ins.
- Maintain Node.js `>=22 <25` compatibility.
- Maintain 100% production statement, branch, function, and production JSDoc coverage.
- Add no skipped or todo tests.
- Keep package versions at `0.0.0` and `CHANGELOG.md` under `Unreleased`.
- Introduce no database.

---

### Task 1: Immutable CLI Argument Contract

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/LICENSE`
- Create: `packages/cli/src/errors.js`
- Create: `packages/cli/src/arguments.js`
- Create: `packages/cli/test/arguments.test.js`

**Interfaces:**
- Consumes: `process.argv.slice(2)`-shaped string arrays and plain environment records.
- Produces: `CliError`, `cliExitCodes`, and `parseCliArguments(argv, environment)` returning a deeply frozen command object.

- [ ] **Step 1: Write the failing parser tests**

Cover exact valid forms for `validate` and `render`; Java/JAR environment fallback; command-line precedence; SVG default; PNG selection; JSON and overwrite flags; unknown command; missing input; extra positional argument; missing/repeated option values; relative renderer paths; unsupported format; render without output; validate with render-only options; non-array argv; non-plain environment; control characters; and help.

```js
const command = parseCliArguments([
  'render',
  'architecture.puml',
  '--output',
  'architecture.svg',
  '--java',
  '/opt/java/bin/java',
  '--jar',
  '/opt/plantuml/plantuml.jar',
], {});
assert.deepEqual(command, {
  kind: 'render',
  inputPath: 'architecture.puml',
  outputPath: 'architecture.svg',
  javaPath: '/opt/java/bin/java',
  jarPath: '/opt/plantuml/plantuml.jar',
  format: 'svg',
  overwrite: false,
  json: false,
  help: false,
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `node --test packages/cli/test/arguments.test.js`

Expected: failure because the package modules do not exist.

- [ ] **Step 3: Implement stable errors and the parser**

Implement:

```js
export const cliExitCodes = Object.freeze({
  success: 0,
  diagramFailure: 1,
  invocationFailure: 2,
});

export class CliError extends Error {
  constructor(code, message, details = {}) { /* safe enumerable fields */ }
}

export function parseCliArguments(argv, environment) { /* strict parser */ }
```

The parser must deep-freeze its return value, reject duplicate singleton options, reject control characters, require absolute Java/JAR paths, and never read global process state.

- [ ] **Step 4: Run focused tests**

Run: `node --test packages/cli/test/arguments.test.js`

Expected: all parser tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/LICENSE packages/cli/src/errors.js packages/cli/src/arguments.js packages/cli/test/arguments.test.js
git commit -m "feat(cli): define deterministic command arguments"
```

### Task 2: Safe Input Discovery and Output Planning

**Files:**
- Create: `packages/cli/src/files.js`
- Create: `packages/cli/test/files.test.js`

**Interfaces:**
- Consumes: parsed `inputPath`, `outputPath`, `format`, and `overwrite`; a filesystem adapter with `lstat`, `readdir`, `mkdir`, `open`, `rename`, and `unlink`.
- Produces:

```js
discoverDiagramInputs(inputPath, fileSystem)
planRenderOutputs(inputs, inputKind, outputPath, format, overwrite, fileSystem)
publishArtifact(destination, bytes, overwrite, fileSystem)
```

- [ ] **Step 1: Write failing discovery tests**

Use temporary directories to cover one file; nested directory discovery; lexical relative-path ordering; `.puml` and `.plantuml`; unsupported files ignored in directories but rejected as direct inputs; empty directory; missing input; symlinked file and directory rejection; non-regular file rejection; and a directory depth greater than the JavaScript recursion comfort zone to establish iterative traversal.

- [ ] **Step 2: Write failing output-plan and publication tests**

Cover single-file destination; directory-relative destination mapping; extension replacement; `foo.puml`/`foo.plantuml` collision; path escape prevention; existing output refusal; output symlink rejection; parent creation after successful preflight; exclusive file creation; atomic overwrite replacement; and temporary-file cleanup after write or rename failure.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test packages/cli/test/files.test.js`

Expected: failure because `src/files.js` does not exist.

- [ ] **Step 4: Implement iterative discovery and atomic publication**

Return frozen input records:

```js
{
  absolutePath,
  relativePath,
  sourceExtension,
}
```

Normalize `relativePath` with `/`. Preflight every destination before creating directories or invoking a renderer. New outputs use `open(path, 'wx')`. Overwrites use a same-directory random temporary name created with `wx`, `sync()`, `close()`, and `rename()`; cleanup is attempted in `finally`.

- [ ] **Step 5: Run focused tests**

Run: `node --test packages/cli/test/files.test.js`

Expected: all filesystem tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/files.js packages/cli/test/files.test.js
git commit -m "feat(cli): discover and publish diagrams safely"
```

### Task 3: Command Execution and Stable Reports

**Files:**
- Create: `packages/cli/src/execute.js`
- Create: `packages/cli/src/presentation.js`
- Create: `packages/cli/src/index.js`
- Create: `packages/cli/test/execute.test.js`
- Create: `packages/cli/test/presentation.test.js`

**Interfaces:**
- Consumes: immutable parsed commands, safe file plans, `createPlantUmlRenderer`, and UTF-8 file reading.
- Produces:

```js
executeDiagramWeaveCli(command, runtime)
formatCliReport(report, json)
runDiagramWeaveCli(argv, options)
```

- [ ] **Step 1: Write failing execution tests**

Inject a fake renderer and cover deterministic file order; validate discarding artifacts; render decoding base64 artifacts; SVG and PNG propagation; mixed success/failure aggregation; renderer-construction failures; source read failures; output publication failures; no output writes when planning fails; source-free result objects; relative path reporting; exact totals; and frozen nested reports.

- [ ] **Step 2: Write failing presentation tests**

Assert an exact JSON object and newline-terminated JSON serialization. Assert concise human lines for success, per-file failure, and invocation failure. Reject accidental serialization of `source`, `dataBase64`, `javaPath`, `jarPath`, `stderr`, or environment keys.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test packages/cli/test/execute.test.js packages/cli/test/presentation.test.js`

Expected: failure because execution and presentation modules do not exist.

- [ ] **Step 4: Implement the executor**

The executor constructs one renderer, processes inputs sequentially, preserves safe renderer error codes, and returns:

```js
{
  schemaVersion: 1,
  command,
  status,
  exitCode,
  format,
  inputKind,
  totals: { selected, succeeded, failed },
  files,
}
```

Do not throw expected CLI failures from `runDiagramWeaveCli`; convert them into invocation reports. Unexpected failures become `internal_cli_error` with no dynamic exception text.

- [ ] **Step 5: Implement presentation and public API**

`formatCliReport(report, true)` returns canonical single-line JSON plus `\n`. Human output includes safe paths, statuses, error codes, and totals only.

- [ ] **Step 6: Run focused tests**

Run: `node --test packages/cli/test/execute.test.js packages/cli/test/presentation.test.js`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/execute.js packages/cli/src/presentation.js packages/cli/src/index.js packages/cli/test/execute.test.js packages/cli/test/presentation.test.js
git commit -m "feat(cli): validate and render deterministic batches"
```

### Task 4: Executable, Packaging, Documentation, and Repository Gates

**Files:**
- Create: `packages/cli/src/bin.js`
- Create: `packages/cli/README.md`
- Create: `packages/cli/test/bin.test.js`
- Modify: `packages/cli/package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `CHANGELOG.md`
- Modify: `tests/repository-contract.test.js`

**Interfaces:**
- Consumes: `runDiagramWeaveCli` and `formatCliReport`.
- Produces: npm executable `dweave` and independently installable package metadata.

- [ ] **Step 1: Write failing executable and repository-contract tests**

Test `--help`, unknown command, missing renderer configuration, `--json` invocation failure, stdout/stderr separation, and exact exit codes by spawning Node with `src/bin.js`. Add repository tests requiring the CLI package, `bin` entry, `files` allowlist, README examples, architecture boundary, PRD implementation status, and CHANGELOG entry.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test packages/cli/test/bin.test.js tests/repository-contract.test.js`

Expected: failure because the executable and documentation do not exist.

- [ ] **Step 3: Implement the executable and package metadata**

`src/bin.js` begins with `#!/usr/bin/env node`, calls the public API, writes normal reports to stdout, writes invocation/internal failures to stderr unless `--json` was requested, and sets `process.exitCode` from the report.

Add to `package.json`:

```json
{
  "bin": { "dweave": "./src/bin.js" },
  "exports": ".\/src\/index.js",
  "files": ["src"],
  "dependencies": {
    "@contextualwisdomlab/diagramweave-plantuml-renderer": "0.0.0"
  }
}
```

- [ ] **Step 4: Update the lockfile and documentation**

Run: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`

Document exact commands, exit codes, environment variables, directory output mapping, overwrite semantics, source non-disclosure, and naruon/CI embedding. Mark FR-070 and FR-071 as implemented foundations without claiming Studio completion.

- [ ] **Step 5: Run package and full repository verification**

Run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm pack --workspace packages/cli --dry-run --json
```

Expected:

- all tests pass;
- production line, branch, and function coverage are 100%;
- production JSDoc coverage is 100%;
- zero skipped/todo tests;
- package contains only `LICENSE`, `README.md`, `package.json`, and `src/*.js`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli package-lock.json README.md docs/architecture.md docs/product/diagramweave-prd.md CHANGELOG.md tests/repository-contract.test.js
git commit -m "feat(cli): publish the dweave command foundation"
```

### Task 5: PR Evidence and Release Decision

**Files:**
- Modify: `docs/superpowers/plans/2026-08-04-cli-foundation.md`

**Interfaces:**
- Consumes: final verification output.
- Produces: one bounded pull request against `main` with exact evidence and residual limits.

- [ ] **Step 1: Record final evidence in this plan**

Add exact test count, coverage totals, JSDoc module count, syntax file count, package dry-run result, and remaining limitations: no structured PlantUML line diagnostics, no Studio, no Language Server, no folder concurrency, and no bundled Java/PlantUML.

- [ ] **Step 2: Re-run the exact final verification**

Run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm pack --workspace packages/cli --dry-run --json
```

Expected: same successful result as Task 4 with a clean working tree except the evidence update.

- [ ] **Step 3: Commit the evidence**

```bash
git add docs/superpowers/plans/2026-08-04-cli-foundation.md
git commit -m "docs: record CLI foundation verification"
```

- [ ] **Step 4: Open one pull request**

Title: `feat: add deterministic DiagramWeave CLI`

The body must include buyer-visible gap, exact commands, security boundaries, verification evidence, release status, and residual limitations. Keep versions at `0.0.0`; do not create a release.
