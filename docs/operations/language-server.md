# DiagramWeave Language Server operations

## Deployment boundary

`@contextualwisdomlab/diagramweave-language-server` is a library session, not a
standalone daemon. Studio, naruon, an IDE extension, or a future transport owns
the process, JSON-RPC framing, file reading, and notification delivery.

A production host supplies absolute Java and PlantUML JAR paths and a
`publishNotification(method, params)` callback. It should omit the test-only
`rendererFactory` option.

## Lifecycle

```text
initialize request
→ initialized notification
→ didOpen / didChange / didClose
→ shutdown request
→ exit notification
```

Document synchronization is unavailable until the client sends `initialized`.
Unknown notifications are ignored for forward compatibility. Unsupported
requests return `method_not_found` through the package error boundary.

## Synchronization contract

- Full snapshots only (`TextDocumentSyncKind.Full`).
- `openClose: true`, `save: false`, and UTF-16 positions.
- One source snapshot per `didChange`.
- Versions are nonnegative safe integers and must increase monotonically.
- Closing a document publishes an empty diagnostic collection.
- Stale renderer completions are discarded after a newer change, close,
  shutdown, exit, or disposal.

## Resource limits

| Resource | Limit |
|---|---:|
| Open documents per session | 256 |
| UTF-8 bytes per complete source snapshot | 1 MiB |
| UTF-8 bytes per document URI | 4 KiB |

The document limit intentionally uses the renderer's default source ceiling,
not its operator-configurable maximum, to keep interactive sessions bounded.

## Privacy and error handling

The language server never reads a file URI, sends a network request, or logs
source. PlantUML syntax errors reuse the renderer's fixed-message structured
diagnostics. A locationless renderer or arbitrary runtime error becomes one
fixed `diagramweave.renderer` diagnostic and one fixed
`window/logMessage`. Raw errors, stack traces, source excerpts, stderr, paths,
and credentials are not propagated.

Notification-sink failures produce `notification_failed`; the host decides
whether to restart or dispose the session. No automatic retry is performed
because duplicate diagnostics can reorder user-visible state.

## Verification

The package is accepted only when repository-level Node 22 and 24 tests,
production line/branch/function coverage, production JSDoc, syntax, dependency,
SAST, security, package-dry-run, and independent review gates all succeed on the
exact pull-request head.
