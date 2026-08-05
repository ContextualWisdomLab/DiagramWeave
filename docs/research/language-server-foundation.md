# Language Server foundation standards record

## Decision

DiagramWeave implements a transport-neutral Language Server Protocol 3.18
session before adding a stdio or socket adapter. The separation keeps LSP
lifecycle, synchronization, diagnostics, and stale-result suppression reusable
inside Studio, IDE extensions, naruon, tests, and future services without
coupling those consumers to one process transport.

The latest published LSP specification is version 3.18. It standardizes editor
and language-server communication and defines JSON-RPC as the message format.
This foundation implements the protocol-level request and notification methods;
Content-Length framing and JSON parsing remain a separate transport boundary.

LSP positions are UTF-16 by default in this package. PlantUML's standard report
provides a one-based line and no character span, so the shared renderer emits a
zero-width diagnostic at UTF-16 character zero on the corresponding zero-based
line. The language-server package reuses that exact diagnostic contract rather
than parsing raw stderr.

## URI boundary

Document URIs are identifiers supplied by the LSP client; the foundation never
dereferences them. RFC 3986 defines the generic URI syntax, while RFC 8089
defines the `file` scheme and warns that treating non-local file URIs as local
can create security problems. DiagramWeave therefore accepts only `file:` URIs
with an empty authority or `localhost`, rejects user information, ports, query
components, and fragments, and limits documents to `.puml` or `.plantuml`.
The original client spelling remains the document identity because the package
performs no filesystem normalization.

## JSON boundary

A later transport adapter must use UTF-8 JSON, reject duplicate or malformed
message members according to its strict contract, enforce bounded
Content-Length framing, and avoid exposing raw parse failures. RFC 8259 defines
JSON as a language-independent structured-data format and requires UTF-8 for
JSON exchanged outside a closed ecosystem. The current package deliberately
does not parse JSON, so transport bugs cannot affect the protocol session.

## Concurrency and stale results

Renderer calls are asynchronous. Every validation captures the document record
and generation that produced it. A completion is published only when the URI is
still open and the same record, version generation, and active session remain
current. Changes, close, shutdown, exit, and disposal invalidate older work.
This prevents an older render from replacing diagnostics for newer source.

## References — APA 7th edition

Berners-Lee, T., Fielding, R., & Masinter, L. (2005). *Uniform resource
identifier (URI): Generic syntax* (RFC 3986). RFC Editor.
https://doi.org/10.17487/RFC3986

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange
format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259

Kerwin, M. (2017). *The “file” URI scheme* (RFC 8089). RFC Editor.
https://doi.org/10.17487/RFC8089

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/
