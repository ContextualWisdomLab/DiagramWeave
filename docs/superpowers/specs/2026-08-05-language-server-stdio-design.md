# Language Server Stdio Transport Design

## Context

The transport-neutral Language Server session can validate live PlantUML source
but cannot yet be launched by a standard IDE. The product needs a process entry
point that implements LSP Content-Length framing and JSON-RPC without moving
transport concerns back into document state.

## Decision

Add `@contextualwisdomlab/diagramweave-language-server-stdio` as a separate
workspace package. It contains a bounded frame reader, strict JSON-RPC codec,
sequential connection, explicit Node stream runner, and `dweave-lsp` executable.
It depends only on the existing Language Server package.

## Data flow

```text
stdin bytes
→ bounded Content-Length reader
→ fatal UTF-8 + strict JSON-RPC object
→ sequential request/notification queue
→ transport-neutral Language Server session
→ fixed response/notification record
→ UTF-8 JSON + Content-Length
→ serialized stdout write
```

## Trust boundaries

- Headers are ASCII and limited to Content-Length plus optional UTF-8
  application/vscode-jsonrpc Content-Type.
- Body, incomplete frame, chunk, pending work, method, and request ID sizes are
  bounded.
- JSON-RPC batches, responses from clients, null/fractional IDs, scalar params,
  unknown members, and controls are rejected.
- Parse and invalid-request errors expose only standard messages and a stable
  DiagramWeave code.
- Output failures close the connection without replay.
- Stderr receives only one fixed configuration line.
- Process adapters and test seams are explicit; the executable alone binds them
  to `process.stdin`, stdout, stderr, environment, and exitCode.

## Concurrency

Connection operations are serialized through one promise tail. A 256-operation
limit prevents unbounded application-level queueing. The underlying Language
Server generation checks remain authoritative for stale renderer results.

## Test strategy

Tests split and combine frames, exercise every header and JSON boundary, use
malformed UTF-8, invalid IDs and params, queue saturation, output failure,
request and notification errors, graceful and abnormal process exits, hostile
proxies, stream failures, and the real Language Server session factory.
Production statement, branch, and function coverage and JSDoc remain exactly
100%, with no skipped or todo tests.

## Release decision

Keep version `0.0.0` under `Unreleased`. This creates a launchable LSP process
but not a Studio release candidate.
