# `@contextualwisdomlab/diagramweave-language-server`

A transport-neutral Language Server Protocol 3.18 session for PlantUML
diagnostics. It is independently reusable by DiagramWeave Studio, IDE
adapters, naruon, and other CWL hosts without importing a desktop shell or
JSON-RPC transport.

## Foundation scope

The package implements protocol-level lifecycle and full-document diagnostic
synchronization:

- `initialize`, `initialized`, `shutdown`, and `exit`;
- `textDocument/didOpen`, `textDocument/didChange`, and
  `textDocument/didClose`;
- `textDocument/publishDiagnostics` and source-free `window/logMessage`;
- UTF-16 positions and LSP full-document synchronization;
- exact document-version and generation binding so stale renderer completions
  cannot overwrite newer diagnostics;
- bounded local `file:` URI identifiers for `.puml` and `.plantuml` documents;
- the existing stdin-only PlantUML `SANDBOX` renderer and shared structured
  diagnostic sanitizer;
- fixed operational diagnostics when the renderer fails without a safe source
  location.

The package does **not** parse Content-Length headers, read stdin, open sockets,
or dereference document URIs. A future transport package will own JSON-RPC
framing. The LSP client supplies complete source snapshots, and the host owns
all file access and process lifecycle.

## Public API

```js
import {
  LanguageServerError,
  createLanguageServerSession,
  languageServerLimits,
} from '@contextualwisdomlab/diagramweave-language-server';

const notifications = [];
const session = createLanguageServerSession({
  javaPath: '/opt/java/bin/java',
  jarPath: '/opt/plantuml/plantuml.jar',
  async publishNotification(method, params) {
    notifications.push({ method, params });
  },
});

await session.request('initialize', {});
await session.notify('initialized', {});
await session.notify('textDocument/didOpen', {
  textDocument: {
    uri: 'file:///workspace/context.puml',
    languageId: 'plantuml',
    version: 1,
    text: '@startuml\nAlice -> Bob\n@enduml\n',
  },
});
```

`rendererFactory` is an optional deterministic test seam. Production hosts
should omit it and use the shared DiagramWeave renderer.

## Safety and limits

- The session never dereferences, reads, or writes a URI and accepts only local
  `file:` URIs with an empty authority or `localhost`.
- Credentials, query strings, fragments, remote authorities, unsupported file
  extensions, control characters, and oversized URIs are rejected.
- A session accepts at most 256 open documents.
- Each complete source snapshot is limited to 1 MiB, matching the renderer's
  default source ceiling.
- Only monotonically increasing nonnegative safe-integer versions are accepted.
- Incremental range edits are rejected; this foundation uses full-document
  synchronization.
- Public diagnostics are deeply frozen and contain no source excerpt, raw
  stderr, raw PlantUML label, Java/JAR path, host error, or credential.
- Hostile getters, proxies, arrays, and renderer contracts fail closed with
  stable `LanguageServerError` codes.

## Release status

Version `0.0.0` is an unreleased foundation. Completion, symbols, definition,
references, rename, JSON-RPC framing, stdio transport, cancellation, and
workspace indexing remain later bounded slices.
