# `@contextualwisdomlab/diagramweave-language-server`

A transport-neutral Language Server Protocol 3.18 session for PlantUML
diagnostics and document outlines. It is independently reusable by
DiagramWeave Studio, IDE adapters, naruon, and other CWL hosts without importing
a desktop shell or JSON-RPC transport.

## Foundation scope

The package implements protocol-level lifecycle, full-document diagnostic
synchronization, and conservative explicit-declaration symbols:

- `initialize`, `initialized`, `shutdown`, and `exit`;
- `textDocument/didOpen`, `textDocument/didChange`, and
  `textDocument/didClose`;
- `textDocument/publishDiagnostics` and source-free `window/logMessage`;
- `textDocument/documentSymbol` with `documentSymbolProvider: true`;
- UTF-16 positions and LSP full-document synchronization;
- exact document-version and generation binding so stale renderer completions
  cannot overwrite newer diagnostics or outline source;
- bounded local `file:` URI identifiers for `.puml` and `.plantuml` documents;
- the existing stdin-only PlantUML `SANDBOX` renderer and shared structured
  diagnostic sanitizer;
- fixed operational diagnostics when the renderer fails without a safe source
  location.

The package does **not** parse Content-Length headers, read stdin, open sockets,
or dereference document URIs. The separate
`@contextualwisdomlab/diagramweave-language-server-stdio` package owns bounded
JSON-RPC framing and the `dweave-lsp` executable. The LSP client supplies
complete source snapshots, and the host owns all file access and process
lifecycle.

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
    text: '@startuml\npackage Context {\n  component API\n}\n@enduml\n',
  },
});

const symbols = await session.request('textDocument/documentSymbol', {
  textDocument: { uri: 'file:///workspace/context.puml' },
});
```

`rendererFactory` is an optional deterministic test seam. Production hosts
should omit it and use the shared DiagramWeave renderer.

## Document-symbol contract

The first outline slice returns a flat declaration-order `DocumentSymbol[]` for
explicit declarations in common class, sequence, component, deployment,
use-case, and state diagrams. Supported declarations include package,
namespace, class, abstract class, interface, enum, annotation, entity, object,
participant, actor, boundary, control, database, collections, queue, component,
node, cloud, frame, folder, artifact, file, stack, storage, card, agent,
rectangle, usecase, and state.

The scanner recognizes quoted, parenthesized, bracketed, colon-delimited, bare,
and `as`-aliased display labels. It masks PlantUML line and block comments while
preserving UTF-16 code-unit offsets. It intentionally ignores implicit
participants, relationships, members, directives, macros, malformed labels,
and inferred nesting rather than inventing semantic structure.

## Safety and limits

- The session never dereferences, reads, or writes a URI and accepts only local
  `file:` URIs with an empty authority or `localhost`.
- Credentials, query strings, fragments, remote authorities, unsupported file
  extensions, control characters, and oversized URIs are rejected.
- A session accepts at most 256 open documents.
- Each complete source snapshot is limited to 1 MiB, matching the renderer's
  default source ceiling.
- One document may expose at most 1,024 symbols; each symbol name is limited to
  1,024 UTF-8 bytes.
- Only monotonically increasing nonnegative safe-integer versions are accepted.
- Incremental range edits are rejected; this foundation uses full-document
  synchronization.
- Public diagnostics and symbols are deeply frozen and contain no source
  excerpt, raw stderr, raw PlantUML label, Java/JAR path, host error, or
  credential.
- Hostile getters, proxies, arrays, renderer contracts, rejected mutations, and
  stale concurrent completions fail closed with stable `LanguageServerError`
  codes.

## Release status

Version `0.0.0` is an unreleased foundation. Completion, hover, definition,
references, rename, hierarchical symbols, workspace indexing, cancellation,
and Studio integration remain later bounded slices.
