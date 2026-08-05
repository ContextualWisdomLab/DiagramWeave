# DiagramWeave Language Server stdio operations

## Launch

```bash
DIAGRAMWEAVE_JAVA_PATH=/absolute/path/to/java \
DIAGRAMWEAVE_PLANTUML_JAR_PATH=/absolute/path/to/plantuml.jar \
dweave-lsp
```

Stdout is reserved exclusively for LSP Content-Length frames. Configuration
failures write one fixed line to stderr. Source, JSON bodies, renderer output,
paths, and environment values are never logged.

## Health and lifecycle

The stdio process has no HTTP health endpoint. The parent editor owns process
supervision. Exit code `0` requires successful `shutdown` and subsequent
`exit`. All malformed input, EOF without `exit`, stream errors, queue overflow,
or exit-before-shutdown paths return `1`.

## Limits and observability

Operators may not enlarge transport limits in this foundation. A bounded
failure is visible through a standard JSON-RPC error when stdout still works,
one fixed Language Server log notification for rejected notifications, and the
process exit code. Host-specific metrics must record only counts, codes,
durations, and byte sizes—not source or message bodies.

## Recovery

The parent may start a fresh process after abnormal exit. The transport does not
retry writes or resume a partial frame. The client re-sends `initialize` and
open-document snapshots to the new process. This avoids ambiguous partial JSON,
duplicate responses, and stale diagnostics.

## Supply chain

The package has no external runtime dependency beyond the DiagramWeave Language
Server workspace package. Release gates must verify the npm lock, Node.js 22 and
24, exact production coverage and JSDoc, package dry-run contents, pinned GitHub
Actions, dependency scanning, SAST, and independent review on the exact head.
