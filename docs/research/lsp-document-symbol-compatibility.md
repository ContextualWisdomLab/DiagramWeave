# LSP document-symbol compatibility research

## Decision summary

DiagramWeave negotiates the presentation of `textDocument/documentSymbol` at
initialize time. A client that explicitly advertises
`textDocument.documentSymbol.hierarchicalDocumentSymbolSupport: true` receives
the existing hierarchical `DocumentSymbol[]`. Every other client receives a
flat `SymbolInformation[]` view derived from the same authoritative PlantUML
symbol tree.

This preserves one parser, one set of UTF-16 ranges, one symbol limit, and one
malformed-source policy while making the transport-neutral server usable by
modern and legacy LSP clients.

## Current standard

The official Language Server Protocol site identifies version 3.18 as the
latest specification. The document-symbol request result is a union that can
contain hierarchical document symbols or flat symbol information. Hierarchical
document symbols became a valid response in LSP 3.10, and the client capability
`hierarchicalDocumentSymbolSupport` declares whether the client can consume
that form.

The capability is not a hint inferred from client identity. DiagramWeave treats
it as an exact boolean contract:

```text
true  -> DocumentSymbol[]
other -> SymbolInformation[]
```

Missing, false, malformed, array-valued, proxied, or throwing capability paths
use the compatibility result. This is fail-closed capability negotiation, not a
protocol error.

## One semantic authority

A second flat PlantUML scanner would create independent behavior for comments,
aliases, delimiters, UTF-16 offsets, hierarchy proof, symbol counts, and malformed
syntax. Instead, DiagramWeave always computes the existing deeply frozen
`DocumentSymbol[]` tree first.

The compatibility adapter then performs iterative source-preorder traversal and
emits one `SymbolInformation` per tree node:

```text
DocumentSymbol.name        -> SymbolInformation.name
DocumentSymbol.kind        -> SymbolInformation.kind
DocumentSymbol.range       -> SymbolInformation.location.range
request document URI       -> SymbolInformation.location.uri
immediate parent name      -> SymbolInformation.containerName
```

Roots omit `containerName`. The adapter deliberately does not copy `detail`,
`selectionRange`, or `children`, because those fields are not part of the flat
contract.

## Ordering and depth

The authoritative tree preserves source order among roots and siblings. A
reverse stack therefore produces deterministic source preorder without
recursive traversal. The existing 1,024-symbol ceiling bounds both output size
and traversal work. A 512-level regression fixture demonstrates that deeply
nested but valid source does not depend on the JavaScript call stack.

## Immutability

The scanner already freezes symbols, ranges, positions, root arrays, and child
arrays. The adapter reuses those trusted ranges and freezes every newly created
location, flat record, traversal frame, and result array. A caller cannot mutate
one response to affect later requests or another host.

## Security and privacy

Capability objects and request records are untrusted. DiagramWeave does not
propagate getter or proxy exceptions, and it does not echo rejected dynamic
values. The flat location uses only the local `file:` URI that already passed
the Language Server's bounded URI validation.

Compatibility conversion performs no file read, URI dereference, renderer
call, LLM call, include or macro evaluation, shell execution, workspace scan,
network request, persistence, or telemetry. Source text, comments, raw labels,
renderer output, Java/JAR paths, credentials, and host exception details are
not included in the response.

## Product implication

Capability-correct output keeps `@contextualwisdomlab/diagramweave-language-server`
reusable by DiagramWeave Studio, modern and older IDE adapters, the bounded
`dweave-lsp` process, naruon, and other CWL hosts. The compatibility layer is a
protocol adapter rather than a new parsing subsystem.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol*. Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/

Microsoft. (2026). *Language Server Protocol specification, version 3.18*.
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/
