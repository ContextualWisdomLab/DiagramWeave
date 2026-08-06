# `@contextualwisdomlab/diagramweave-language-server-stdio`

A bounded JSON-RPC 2.0 stdio transport for the transport-neutral DiagramWeave
Language Server session. It makes the reusable session launchable from IDEs and
Studio while keeping document state, diagnostics, document symbols, declaration completion, and
conservative folding ranges in the existing
`@contextualwisdomlab/diagramweave-language-server` package.

## Launch

Install the package and configure absolute local runtime paths:

```bash
export DIAGRAMWEAVE_JAVA_PATH=/opt/java/bin/java
export DIAGRAMWEAVE_PLANTUML_JAR_PATH=/opt/plantuml/plantuml.jar
dweave-lsp
```

The executable reads LSP `Content-Length` frames from stdin and writes only
framed JSON-RPC responses and notifications to stdout. Configuration failures
use one fixed source-free stderr line. The runner never calls `process.exit`;
it sets a process exit code after a graceful or abnormal connection close.

A graceful process exit requires a successful `shutdown` request followed by an
`exit` notification. EOF, malformed framing, malformed JSON, stream failure,
queue overflow, or `exit` without successful shutdown returns code `1`.

## Framing and JSON contract

- ASCII headers terminated by `\r\n\r\n`.
- Exactly one decimal `Content-Length` header.
- Optional single `Content-Type` limited to
  `application/vscode-jsonrpc` with UTF-8/utf8 charset.
- Unknown, duplicate, folded, non-ASCII, malformed, oversized, or unsupported
  headers fail closed.
- UTF-8 JSON only, using JSON-RPC version `2.0`.
- One request or notification object per frame; JSON-RPC batches and incoming
  response objects are rejected.
- Request IDs are nonempty bounded strings or safe integers. Null, fractional,
  oversized, and controlled IDs are rejected.
- Methods are nonempty bounded strings without control characters.
- Params are object, array, or null.

## Language features

The process uses the public transport-neutral session and therefore exposes the
same accepted-source state for:

- `textDocument/publishDiagnostics`;
- `textDocument/documentSymbol`;
- capability-gated `textDocument/completion`.
- capability-gated `textDocument/foldingRange`.

A completion-capable client must send a plain
`capabilities.textDocument.completion` object during initialize. The server
then advertises `completionProvider: { resolveProvider: false }`. Declaration
completion is deterministic, local, bounded, and returns exact UTF-16 text
edits. No completion request invokes an LLM, renderer, filesystem, include,
macro, workspace scan, or network service.

Malformed completion parameters and `document_position_invalid` map to JSON-RPC
`-32602` with the fixed `Invalid params.` message. The response may include only
the stable DiagramWeave error code; it never echoes source, URI, position,
caller exception, or hostile getter content.

A folding-capable client sends a plain `capabilities.textDocument.foldingRange`
record during initialize. The server advertises `foldingRangeProvider: true`,
honors valid `rangeLimit` and boolean `lineFoldingOnly` options, and serializes
the same immutable `textDocument/foldingRange` result as an embedded host. A
non-negotiated request maps to the fixed method-not-found response without
echoing source or URI values.

## Resource limits

| Resource | Limit |
|---|---:|
| Header | 8 KiB |
| JSON body | 2 MiB |
| One input chunk | 4 MiB |
| Retained incomplete frame | 2,105,347 bytes |
| Pending chunks/messages | 256 |
| Method | 256 UTF-8 bytes |
| String request ID | 256 UTF-8 bytes |

All exported limits are frozen. Malformed input poisons the frame reader,
emits one JSON-RPC parse/invalid-request response when stdout remains usable,
disposes the Language Server session, and accepts no later input.

## Programmatic embedding

```js
import {
  createLanguageServerStdioConnection,
  runLanguageServerStdioProcess,
} from '@contextualwisdomlab/diagramweave-language-server-stdio';
```

`createLanguageServerStdioConnection` accepts a `writeBytes` callback and
`onExit` observer. `runLanguageServerStdioProcess` accepts explicit Node-style
`input`, `output`, `stderr`, `environment`, and `setExitCode` adapters. The
package does not import a desktop UI, filesystem watcher, network server, or
provider SDK and can be embedded independently by Studio, naruon, and other CWL
hosts.

`rendererFactory` and `sessionFactory` are deterministic test seams. Production
hosts and the `dweave-lsp` executable should omit them.

## Security and privacy

The transport never logs source, JSON bodies, raw parser exceptions, raw
renderer output, Java/JAR paths, environment values, stack traces, or
credentials. Session failures map to fixed JSON-RPC messages plus one stable
DiagramWeave code. Notification failures receive no JSON-RPC response and emit
only a fixed `window/logMessage` notification. Output writes are serialized;
a write failure closes the connection without retrying or reordering messages.

The stdio layer does not duplicate completion, folding, or document snapshots. It cannot
weaken the Language Server's local-URI, source-size, lifecycle, capability,
immutability, or stale-mutation contracts.

## Release status

Version `0.0.0` is unreleased. TCP/WebSocket transports, cancellation,
parallel request execution, Studio packaging, completion resolve, arbitrary
region folding, semantic navigation, workspace indexing, and signed binaries
remain separate bounded slices.
