# Language Server stdio transport standards record

## Decision

DiagramWeave adds a separate bounded stdio package around the transport-neutral
Language Server session. The Language Server Protocol 3.18 base protocol uses
JSON-RPC messages framed by an ASCII `Content-Length` header and an optional
UTF-8 content type. Separating framing from document state prevents malformed
headers or JSON from entering the session and lets Studio, IDE processes, and
naruon reuse the same lifecycle without importing a network server.

## Framing

The reader accepts arbitrary byte chunks and finds the exact `\r\n\r\n`
separator. It requires one decimal `Content-Length`, accepts one optional
`application/vscode-jsonrpc` UTF-8 content type, and rejects all other headers.
The length is measured in bytes. Headers, bodies, incomplete buffers, chunks,
and pending messages are bounded before parsing or dispatch.

Malformed framing and malformed UTF-8/JSON map to JSON-RPC parse error
`-32700`. Structurally invalid JSON-RPC objects map to invalid request `-32600`.
Batches and client responses are deliberately excluded from the first stdio
slice because LSP clients send requests and notifications to language servers.

## JSON

RFC 8259 requires UTF-8 for JSON exchanged across systems outside a closed
ecosystem and notes interoperability problems around duplicate names and
unpredictable numeric precision. DiagramWeave decodes UTF-8 fatally, requires a
single JSON object, rejects unknown top-level JSON-RPC members, and restricts
numeric IDs to safe integers. Request IDs and method names are additionally
bounded and cannot contain controls.

## Process and output

Input operations are serialized to preserve protocol order and bounded to 256
pending chunks/messages. Output frames are serialized through the writable
stream callback. A failed output closes the connection; it is not retried
because replaying responses or diagnostics can duplicate or reorder client
state. The process runner never calls `process.exit` and removes its listeners
when the session reports a final code.

## References — APA 7th edition

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange
format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/
