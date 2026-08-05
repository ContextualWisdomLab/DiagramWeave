# `@contextualwisdomlab/diagramweave-language-server`

A transport-neutral Language Server Protocol 3.18 session for PlantUML
diagnostics, hierarchical document outlines, and deterministic declaration
completion. It is independently reusable by DiagramWeave Studio, IDE adapters,
naruon, and other CWL hosts without importing a desktop shell or JSON-RPC
transport.

## Foundation scope

The package implements protocol-level lifecycle, full-document diagnostic
synchronization, conservative explicit-declaration hierarchy, and local keyword
completion:

- `initialize`, `initialized`, `shutdown`, and `exit`;
- `textDocument/didOpen`, `textDocument/didChange`, and
  `textDocument/didClose`;
- `textDocument/publishDiagnostics` and source-free `window/logMessage`;
- `textDocument/documentSymbol` with `documentSymbolProvider: true`;
- capability-gated `textDocument/completion` with
  `completionProvider: { resolveProvider: false }`;
- UTF-16 positions and LSP full-document synchronization;
- exact document-version and generation binding so stale renderer completions
  cannot overwrite newer diagnostics, outline source, or completion source;
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

const initializeResult = await session.request('initialize', {
  capabilities: {
    textDocument: {
      completion: {},
    },
  },
});
await session.notify('initialized', {});
await session.notify('textDocument/didOpen', {
  textDocument: {
    uri: 'file:///workspace/context.puml',
    languageId: 'plantuml',
    version: 1,
    text: '@startuml\npackage Context {\n  class Model\n  com\n}\n@enduml\n',
  },
});

const symbols = await session.request('textDocument/documentSymbol', {
  textDocument: { uri: 'file:///workspace/context.puml' },
});

const completions = await session.request('textDocument/completion', {
  textDocument: { uri: 'file:///workspace/context.puml' },
  position: { line: 3, character: 5 },
});

console.log(initializeResult.capabilities.completionProvider);
console.log(symbols[0].children.map(({ name }) => name));
console.log(completions.map(({ label }) => label));
```

`rendererFactory` is an optional deterministic test seam. Production hosts
should omit it and use the shared DiagramWeave renderer.

## Document-symbol contract

The outline returns source-order `DocumentSymbol[]` roots for explicit
high-signal declarations in common class, sequence, component, deployment,
use-case, and state diagrams. Supported declarations include package,
namespace, class, abstract class, interface, enum, annotation, entity, object,
participant, actor, boundary, control, database, collections, queue, component,
node, cloud, frame, folder, artifact, file, stack, storage, card, agent,
rectangle, usecase, and state.

The scanner recognizes quoted, parenthesized, bracketed, colon-delimited, bare,
and `as`-aliased display labels. It masks PlantUML line and block comments while
preserving UTF-16 code-unit offsets. It intentionally ignores implicit
participants, relationships, members, directives, macros, malformed labels,
and renderer-dependent syntax rather than inventing semantic structure.

A declaration receives optional frozen `children` only when the scanner proves a
complete scope from exactly one unmatched unquoted `{` on the declaration line
and a later standalone `}` with exactly the same indentation. Structural braces
close in stack order. Parent ranges extend through the original closing-brace
line; selection ranges continue to identify only the displayed label.

Quoted or commented braces, balanced one-line blocks, unmatched or
cross-indented braces, multiple openings, crossed structure, and other ambiguous
cases remain flat. A complete inner scope may remain a root when its outer
source is unproven. Roots and siblings retain declaration order, and the final
tree is built and frozen bottom-up without recursive product traversal.

## Declaration-completion contract

The completion slice returns deterministic declaration-keyword
`CompletionItem[]` only when the client advertises a plain
`capabilities.textDocument.completion` object during initialize. The provider
does not support resolve, snippets, commands, documentation fetches, or
additional edits.

The catalog contains `@startuml`, `@enduml`, and the same high-signal explicit
PlantUML declaration families used by the outline, including `abstract class`.
Matching is case-insensitive and candidates remain in stable catalog order.
Each item is an LSP keyword with plain-text insertion and an explicit UTF-16
`textEdit` that replaces only the line-leading typed prefix.

Completion intentionally returns an empty immutable collection inside or after
comments, inside quoted labels, after relation or directive syntax, after a
completed declaration, in the middle of an existing identifier, and for
prefixes with no catalog match. It never calls an LLM, reads a URI, evaluates
includes or macros, starts the renderer, scans a workspace, or contacts the
network.

## Safety and limits

- The session never dereferences, reads, or writes a URI and accepts only local
  `file:` URIs with an empty authority or `localhost`.
- Credentials, query strings, fragments, remote authorities, unsupported file
  extensions, control characters, and oversized URIs are rejected.
- A session accepts at most 256 open documents.
- Each complete source snapshot is limited to 1 MiB, matching the renderer's
  default source ceiling.
- One document may expose at most 1,024 explicit symbols across roots and
  descendants; each symbol name is limited to 1,024 UTF-8 bytes.
- One completion request may return at most 64 items.
- Only monotonically increasing nonnegative safe-integer versions are accepted.
- Incremental range edits are rejected; this foundation uses full-document
  synchronization.
- Public diagnostics, symbol trees, completion results, child arrays, positions,
  ranges, and edits are deeply frozen and contain no source excerpt, raw stderr,
  raw PlantUML label, Java/JAR path, host error, or credential.
- Hostile getters, proxies, arrays, renderer contracts, rejected mutations, and
  stale concurrent completions fail closed with stable `LanguageServerError`
  codes.

## Release status

Version `0.0.0` is an unreleased foundation. Completion resolve, snippets,
hover, definition, references, rename, legacy flat-only symbol fallback,
workspace indexing, cancellation, and Studio integration remain later bounded
slices.
