# `@contextualwisdomlab/diagramweave-language-server`

A transport-neutral Language Server Protocol 3.18 session for PlantUML
diagnostics, capability-negotiated document outlines, deterministic declaration
completion, conservative folding ranges, and evidence-bounded declaration hover.
It is independently reusable by DiagramWeave Studio, IDE adapters, naruon, and
other CWL hosts without importing a desktop shell or JSON-RPC transport.

## Foundation scope

The package implements protocol-level lifecycle, full-document diagnostic
synchronization, conservative explicit-declaration hierarchy, legacy outline
compatibility, local keyword completion, bounded package/namespace folding, and
exact declaration-label hover:

- `initialize`, `initialized`, `shutdown`, and `exit`;
- `textDocument/didOpen`, `textDocument/didChange`, and
  `textDocument/didClose`;
- `textDocument/publishDiagnostics` and source-free `window/logMessage`;
- `textDocument/documentSymbol` with `documentSymbolProvider: true`;
- `DocumentSymbol[]` or `SymbolInformation[]` selected from the client's
  `hierarchicalDocumentSymbolSupport` capability;
- capability-gated `textDocument/completion` with
  `completionProvider: { resolveProvider: false }`;
- capability-gated `textDocument/foldingRange` with
  `foldingRangeProvider: true`;
- capability-gated `textDocument/hover` with `hoverProvider: true`;
- UTF-16 positions and LSP full-document synchronization;
- exact document-version and generation binding so stale renderer completions
  cannot overwrite newer diagnostics, outline source, completion source,
  folding source, or hover source;
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
      documentSymbol: {
        hierarchicalDocumentSymbolSupport: true,
      },
      completion: {},
      foldingRange: {
        rangeLimit: 1024,
        lineFoldingOnly: true,
      },
      hover: {
        contentFormat: ['markdown', 'plaintext'],
      },
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

const folds = await session.request('textDocument/foldingRange', {
  textDocument: { uri: 'file:///workspace/context.puml' },
});

const declarationHover = await session.request('textDocument/hover', {
  textDocument: { uri: 'file:///workspace/context.puml' },
  position: { line: 2, character: 10 },
});

console.log(initializeResult.capabilities.hoverProvider);
console.log(symbols[0].children.map(({ name }) => name));
console.log(completions.map(({ label }) => label));
console.log(folds);
console.log(declarationHover?.contents.value);
```

`rendererFactory` is an optional deterministic test seam. Production hosts
should omit it and use the shared DiagramWeave renderer.

## Document-symbol contract

The scanner creates source-order `DocumentSymbol[]` roots for explicit
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
complete scope from exactly one unmatched unquoted `{` on a package or namespace
line and a later standalone `}` with exactly the same indentation. Structural
braces close in stack order. Parent ranges extend through the original
closing-brace line; selection ranges continue to identify only the displayed
label.

Quoted or commented braces, balanced one-line blocks, unmatched or
cross-indented braces, multiple openings, crossed structure, and other ambiguous
cases remain flat. A complete inner scope may remain a root when its outer
source is unproven. Roots and siblings retain declaration order, and the final
tree is built and frozen bottom-up without recursive product traversal.

### Client compatibility

The initialize capability selects only the response presentation:

```text
textDocument.documentSymbol.hierarchicalDocumentSymbolSupport === true
  -> DocumentSymbol[]
all other values
  -> SymbolInformation[]
```

The flat compatibility view is derived iteratively from the same authoritative
tree. It preserves source preorder, `name`, `kind`, the validated local document
URI, and the enclosing `range`. Roots omit `containerName`; descendants use the
immediate proven parent's display name. Every result array, flat record, and
location is frozen. Missing, false, malformed, array-valued, proxied, or throwing
capability paths fail closed to the flat view without dynamic error leakage.

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

## Folding-range contract

The folding slice is enabled only when initialize receives a plain
`capabilities.textDocument.foldingRange` record. The server then advertises
`foldingRangeProvider: true` and accepts `textDocument/foldingRange` for the
latest accepted local document snapshot.

The optional `rangeLimit` must be an LSP unsigned integer. When absent, the
server returns at most 1,024 source-order ranges; `0` returns the shared frozen
empty result, and larger valid values remain capped by the 1,024-symbol ceiling.
The optional `lineFoldingOnly` value may be absent or boolean. Malformed, array,
proxied, revoked, or throwing capability data fails closed and does not advertise
the provider.

`foldingRangesForSource` iteratively walks the same authoritative symbol tree
used by `textDocument/documentSymbol`. It emits only nonempty package and
namespace scopes whose stack-ordered closing brace and matching indentation were
already proven. The immutable result contains only zero-based `startLine` and
`endLine`; it performs no LLM, renderer, filesystem, include, macro, workspace,
or network work.

## Declaration-hover contract

The hover slice is enabled only when initialize receives a plain
`capabilities.textDocument.hover` record. The server advertises
`hoverProvider: true` and accepts `textDocument/hover` for the latest accepted
local source snapshot.

An absent `contentFormat` selects `plaintext`. A present list must contain 1
through 16 strings. The server selects the first supported `markdown` or
`plaintext` value in client preference order. Missing, malformed, array-valued,
proxied, revoked, throwing, oversized, or unsupported capability data fails
closed and does not advertise the provider.

`declarationHoverForSource` iteratively walks the same authoritative symbol tree
used by outlines and folding. It returns a hover only when the requested UTF-16
position lies inside an explicit declaration's exact `selectionRange`, with an
inclusive start and exclusive end. The response contains the fixed PlantUML
declaration detail, displayed name, and immediate proven package or namespace
container when present. The authoritative frozen selection range is returned
unchanged.

A valid non-matching position returns `null`. Relations, members, directives,
comments, malformed declarations, implicit syntax, keywords, braces, and
ordinary whitespace are intentionally omitted. Markdown places the same text in
a dynamically sized fenced `text` block whose delimiter is longer than every
backtick run in source-derived labels. The feature performs no LLM, renderer,
filesystem, include, macro, workspace, shell, or network work.

## Safety and limits

- The session never dereferences, reads, or writes a URI and accepts only local
  `file:` URIs with an empty authority or `localhost`.
- Credentials, query strings, fragments, remote authorities, unsupported file
  extensions, control characters, and oversized URIs are rejected.
- A session accepts at most 256 open documents.
- Each complete source snapshot is limited to 1 MiB, matching the renderer's
  default source ceiling.
- One document may expose at most 1,024 symbols across roots and descendants;
  each symbol name is limited to 1,024 UTF-8 bytes.
- One completion request may return at most 64 items.
- A hover `contentFormat` preference list may contain at most 16 entries.
- Only monotonically increasing nonnegative safe-integer versions are accepted.
- Incremental range edits are rejected; this foundation uses full-document
  synchronization.
- Public diagnostics, symbol trees, symbol information, completion results,
  folding results, hover results, markup records, locations, child arrays,
  positions, ranges, and edits are deeply frozen and contain no source excerpt,
  raw stderr, Java/JAR path, host error, or credential.
- Hostile getters, proxies, arrays, renderer contracts, rejected mutations, and
  stale concurrent completions fail closed with stable `LanguageServerError`
  codes.

## Release status

Version `0.0.0` is an unreleased foundation. Completion resolve, snippets,
relation and member hover, definition, references, rename, arbitrary region
folding, workspace indexing, cancellation, and Studio integration remain later
bounded slices.
