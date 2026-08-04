# `@contextualwisdomlab/diagramweave-cli`

Deterministic, source-first PlantUML validation and rendering for terminals, CI,
naruon, and other CWL hosts. The package performs no LLM call, network fetch,
implicit Java or PlantUML download, source persistence, or include enablement.
It reuses DiagramWeave's bounded local renderer and treats source files as the
only authoritative input.

## Commands

Validate one file or every supported file below a directory:

```bash
dweave validate ./diagrams \
  --java /absolute/path/to/java \
  --jar /absolute/path/to/plantuml.jar
```

Render one source to one artifact:

```bash
dweave render ./diagrams/context.puml \
  --output ./artifacts/context.svg \
  --java /absolute/path/to/java \
  --jar /absolute/path/to/plantuml.jar
```

Render a directory recursively while preserving relative subdirectories:

```bash
dweave render ./diagrams \
  --output ./artifacts \
  --format png \
  --java /absolute/path/to/java \
  --jar /absolute/path/to/plantuml.jar
```

For a directory input, `services/api.puml` maps to `services/api.svg` or
`services/api.png` below the output directory. Discovery and result ordering use
normalized lexical relative paths, so repeated runs report files deterministically.

`--java` and `--jar` may be omitted only when these environment variables are
present:

```text
DIAGRAMWEAVE_JAVA_PATH
DIAGRAMWEAVE_PLANTUML_JAR_PATH
```

Explicit command-line values take precedence. Both values must be absolute; the
CLI never discovers or downloads executables.

## Output and exit codes

Add `--json` to receive one newline-terminated `CliExecutionReport`. Human and
JSON output include only normalized paths, stable status and error codes,
counts, and source revision hashes. They never include source text, raw renderer
stderr, environment values, Java/JAR paths, or base64 artifacts.

| Exit code | Meaning |
|---:|---|
| `0` | Every selected diagram validated or rendered successfully. |
| `1` | One or more diagrams failed renderer validation. |
| `2` | Invocation, input, configuration, or output publication failed. |

The executor continues after per-diagram renderer failures so CI receives a
complete deterministic batch result. Operational failures return exit code `2`.

## Safe filesystem contract

- Direct inputs must be regular `.puml` or `.plantuml` files.
- Directory traversal is iterative and ignores unsupported regular files.
- Symbolic links are rejected in input and output paths.
- Every destination is preflighted before PlantUML starts.
- Case-insensitive destination collisions are rejected.
- Existing outputs are refused unless `--overwrite` is explicit.
- New files use exclusive creation.
- Overwrites use a same-directory temporary file, sync, close, and atomic rename.
- Rendered source is passed only to the existing stdin-only PlantUML `SANDBOX` renderer.

The CLI does not enable local or remote PlantUML includes. Output SVG remains
untrusted active content and must be sanitized or displayed through a safe image
boundary rather than injected with `innerHTML`.

## Programmatic embedding

The library API does not call `process.exit` and can be embedded by naruon,
repository automation, or another independently deployed CWL module:

```js
import {
  cliExitCodes,
  formatCliReport,
  runDiagramWeaveCli,
} from '@contextualwisdomlab/diagramweave-cli';

const report = await runDiagramWeaveCli([
  'validate',
  './diagrams',
  '--java',
  '/opt/java/bin/java',
  '--jar',
  '/opt/plantuml/plantuml.jar',
]);

if (report.exitCode !== cliExitCodes.success) {
  process.stderr.write(formatCliReport(report, false));
}
```

Tests may inject filesystem and renderer adapters through the optional
`runDiagramWeaveCli` options record. Production hosts should use the default
Node.js filesystem and DiagramWeave renderer boundary.

## Release status

Version `0.0.0` is an unreleased foundation. DiagramWeave does not bundle Java
or PlantUML; distributors must select compatible artifacts and satisfy their
license and support obligations separately.
