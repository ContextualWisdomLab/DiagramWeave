# DiagramWeave CLI Foundation Design

## Status

Approved implementation design derived from the DiagramWeave PRD requirements FR-070 and FR-071 and the user's standing instruction to continue autonomous product development after the PR queue reaches zero.

## Product outcome

The first usable DiagramWeave surface will be a source-first command-line package named `@contextualwisdomlab/diagramweave-cli` with the executable `dweave`. It gives users and CI systems a deterministic manual workflow before DiagramWeave Studio exists:

```text
dweave validate <file-or-directory>
dweave render <file-or-directory> --output <path>
```

The CLI reuses the existing sandboxed PlantUML renderer. It does not call an LLM, access the network, evaluate source as code, enable includes, or hide the source behind a proprietary project format.

## Scope

### `dweave validate`

- Accept one `.puml` or `.plantuml` file or one directory.
- Recursively discover supported files in a directory.
- Sort files by normalized relative path so results are deterministic across filesystems.
- Render each source to bounded SVG in memory through `@contextualwisdomlab/diagramweave-plantuml-renderer` and discard the artifact after validation.
- Return exit code `0` only when every selected diagram validates.
- Return exit code `1` when one or more diagrams fail renderer validation.
- Return exit code `2` for invalid invocation, unsafe paths, unreadable input, output collisions, or configuration errors.
- Support human-readable output and `--json` structured output without returning source text or raw renderer diagnostics.

### `dweave render`

- Accept the same file or directory inputs.
- Require `--output <path>`.
- For a single input file, `--output` names the destination artifact.
- For a directory input, `--output` names a destination directory. Relative subdirectories are preserved and source extensions become `.svg` or `.png`.
- Default to SVG and accept `--format svg|png`.
- Refuse existing output files by default.
- Permit explicit `--overwrite`, implemented with an atomic temporary-file replacement.
- Detect all destination collisions before running PlantUML.
- Create parent directories only after the full plan is validated.
- Return the same exit-code and structured-result contracts as `validate`.

## Command contract

```text
dweave validate <input> \
  --java <absolute-java-path> \
  --jar <absolute-plantuml-jar-path> \
  [--json]

dweave render <input> \
  --output <file-or-directory> \
  --java <absolute-java-path> \
  --jar <absolute-plantuml-jar-path> \
  [--format svg|png] \
  [--overwrite] \
  [--json]
```

`--java` and `--jar` may be omitted only when `DIAGRAMWEAVE_JAVA_PATH` and `DIAGRAMWEAVE_PLANTUML_JAR_PATH` are present. Command-line values take precedence. The package never discovers or downloads Java or PlantUML implicitly.

Unknown options, repeated singleton options, missing option values, extra positional arguments, relative Java/JAR paths, and incompatible option combinations fail before reading source.

## Package architecture

### `src/arguments.js`

Pure argument parsing and validation. It exports:

```js
parseCliArguments(argv, environment)
```

The result is a deeply frozen command object. It contains no filesystem or process operations.

### `src/files.js`

Safe input discovery and output planning. It exports:

```js
discoverDiagramInputs(inputPath, fileSystem)
planRenderOutputs(inputs, inputKind, outputPath, format, overwrite, fileSystem)
publishArtifact(destination, bytes, overwrite, fileSystem)
```

This module rejects symbolic links, non-regular input files, unsupported extensions, empty directories, path escapes, duplicate source identities, and destination collisions. Directory traversal is iterative rather than recursive so deep workspaces cannot overflow the JavaScript stack.

### `src/execute.js`

Command orchestration. It exports:

```js
executeDiagramWeaveCli(command, runtime)
```

The runtime supplies the filesystem adapter and renderer factory. Production uses Node.js built-ins and `createPlantUmlRenderer`; tests use deterministic adapters. The executor aggregates per-file results instead of stopping at the first invalid diagram.

### `src/presentation.js`

Stable JSON and human-readable serialization. It never includes source, raw renderer stderr, environment values, or Java/JAR paths.

### `src/index.js`

Programmatic public API:

```js
runDiagramWeaveCli(argv, options)
cliExitCodes
```

The library returns an immutable execution report and does not call `process.exit`.

### `src/bin.js`

Thin executable boundary. It passes `process.argv.slice(2)` and `process.env` to the public API, writes the serialized result, sets `process.exitCode`, and converts unexpected errors to one source-free internal failure.

## Structured result

```text
CliExecutionReport
- schemaVersion = 1
- command = validate | render
- status = success | diagram_failure | invocation_failure
- exitCode = 0 | 1 | 2
- format = svg | png | null
- inputKind = file | directory | null
- totals
  - selected
  - succeeded
  - failed
- files[]
  - relativePath
  - status = valid | rendered | failed
  - sourceRevisionHash | null
  - outputPath | null
  - errorCode | null
  - errorMessage | null
```

Paths are normalized relative paths for directory inputs. A single-file result uses the input basename and output basename rather than exposing unrelated absolute parent directories.

## Security boundaries

- Reject symbolic links for input files, traversed directories, and existing output targets.
- Accept only regular `.puml` and `.plantuml` files.
- Use the renderer's existing UTF-8 source bound, timeout, output bound, `SANDBOX`, metadata suppression, and source-free error contract.
- Never invoke a shell.
- Never put source text in command-line arguments, logs, JSON output, or errors.
- Preflight every destination before rendering so partial work is not caused by predictable collisions.
- Write new files with exclusive creation.
- For `--overwrite`, write a same-directory temporary file with exclusive creation, sync and close it, then atomically rename it over the destination. Remove the temporary file on failure.
- Do not follow output symlinks.

## Determinism

- Normalize directory-relative paths to `/` in reports and sorting.
- Discover files in lexical relative-path order.
- Preserve exact source bytes for reading and hash the exact decoded UTF-8 source through the renderer artifact.
- Render one file at a time in the initial implementation. This avoids resource spikes and makes failure ordering stable.
- Detect output collisions before renderer invocation.

## Error handling

Usage and configuration failures return one invocation report with exit code `2`. Per-diagram renderer failures are collected and return exit code `1`. Successful validation or rendering returns `0`.

Stable CLI error codes include:

```text
invalid_cli_arguments
invalid_cli_environment
input_not_found
input_not_supported
input_symlink_rejected
input_read_failed
input_empty
output_required
output_collision
output_exists
output_symlink_rejected
output_write_failed
internal_cli_error
```

Renderer error codes are preserved in per-file results when safe.

## Testing and quality gates

- Argument-parser table tests for every command, option, environment fallback, duplicate, and incompatibility.
- Temporary-directory tests for file and directory discovery, deep iterative traversal, ordering, symlink rejection, empty input, and output collisions.
- Executor tests with a fake renderer for mixed success/failure aggregation, deterministic invocation order, format propagation, source non-disclosure, and write behavior.
- Atomic publication tests for exclusive creation, overwrite replacement, cleanup after failure, and no output before plan validation.
- Presentation tests for exact JSON schema and human output.
- Executable smoke tests for help, usage failure, and source-free unexpected errors.
- Package dry-run tests that permit only `LICENSE`, `README.md`, `package.json`, and `src/*.js`.
- Production statement, branch, function, and JSDoc coverage remain exactly 100% with no skipped or todo tests.

## Documentation and release

Update the root README, CLI package README, architecture, PRD implementation-status text, and `CHANGELOG.md`. Keep every package at `0.0.0` and changes under `Unreleased`; the CLI foundation does not yet constitute an integrated Studio release.
