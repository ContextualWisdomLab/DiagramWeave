# Language Server Foundation Design

## Context

DiagramWeave now has a revision-safe Core, a sandboxed PlantUML renderer, a
deterministic CLI, and LSP-compatible source-free diagnostics. The remaining
buyer-visible gap is a reusable live-document session that can deliver those
diagnostics to Studio, IDEs, naruon, and other CWL hosts without each consumer
reimplementing lifecycle and stale-result handling.

## Approaches considered

### Full stdio server in one slice

This would provide immediate IDE launchability, but it combines JSON-RPC
framing, process lifecycle, document state, renderer integration, and
diagnostics in one review. Transport defects could compromise otherwise safe
protocol logic, and non-stdio hosts would need adapters around the daemon.

### IDE-specific extension first

This is fast for one editor but violates provider neutrality and makes naruon,
Studio, and other IDEs repeat the same state and diagnostic logic.

### Transport-neutral LSP session first — selected

A small package implements LSP 3.18 lifecycle, full-document synchronization,
diagnostics, limits, and stale-result suppression behind `request`, `notify`,
and `dispose`. A later package can add bounded JSON-RPC stdio framing without
changing the session. This is the smallest independently valuable and modular
slice.

## Architecture

```text
Studio / IDE / naruon / future stdio adapter
                 │ request + notify
                 ▼
DiagramWeave Language Server session
   ├─ lifecycle state
   ├─ bounded open-document map
   ├─ exact version/generation binding
   └─ publishNotification callback
                 │ source snapshot
                 ▼
Sandboxed PlantUML renderer
                 │ safe diagnostics
                 ▼
shared diagnostic sanitizer → LSP publishDiagnostics
```

The session never dereferences a URI. The client owns source acquisition and
sends complete snapshots. Renderer calls remain local and use the existing
`SANDBOX`, stdin-only, bounded process contract.

## Public API

```js
createLanguageServerSession({
  javaPath,
  jarPath,
  publishNotification,
  rendererFactory?,
}) -> {
  request(method, params?) -> Promise<unknown>,
  notify(method, params?) -> Promise<void>,
  dispose() -> void,
}
```

The package root exports only `createLanguageServerSession`,
`LanguageServerError`, and `languageServerLimits`. Validators and diagnostic
normalizers remain internal implementation details.

## Protocol scope

Requests:

- `initialize`
- `shutdown`

Notifications:

- `initialized`
- `textDocument/didOpen`
- `textDocument/didChange`
- `textDocument/didClose`
- `exit`

Unknown notifications are ignored. Unknown requests fail with
`method_not_found`. Document work requires both a completed initialize request
and the `initialized` notification.

The server advertises UTF-16 positions and full-document synchronization.
Incremental changes are rejected so source and renderer revision semantics stay
unambiguous.

## Trust boundaries

- Options and protocol records must be plain objects and hostile property
  access fails closed.
- Java and JAR paths must be absolute.
- Document identifiers must be bounded local `file:` URIs with an empty
  authority or `localhost`, no credentials/query/fragment/port, and a PlantUML
  extension.
- URI identifiers are never dereferenced or converted to paths.
- Documents are limited to 1 MiB and sessions to 256 open documents.
- Syntax diagnostics are accepted only from `PlantUmlRendererError` and cloned
  by `sanitizePlantUmlDiagnostics`.
- Unknown renderer failures collapse to fixed source-free diagnostics.
- Host notification failures never expose the thrown value.

## Concurrency

Each document record owns a monotonically increasing generation. Validation
captures the record and generation. Results publish only when the same record
and generation remain current and the session is active. A change, close,
shutdown, exit, or disposal invalidates older completions.

## Testing

Tests cover lifecycle, immutable capabilities, realistic PlantUML source
snapshots, syntax and operational diagnostics, full synchronization, local URI
rules, limits, 256-document overflow, duplicate open, version ordering, stale
render races, close/shutdown/dispose races, notification failure, renderer
construction, hostile getters/proxies/arrays, fixed public exports, packaging,
and source-free errors. Production statement, branch, and function coverage and
production JSDoc remain exactly 100%; skipped/todo tests remain zero.

## Release decision

Keep version `0.0.0` under `Unreleased`. The package is a reusable foundation,
not a release candidate, because JSON-RPC transport, symbols, navigation,
completion, Studio integration, signed packaging, and cross-platform runtime
evidence remain.
