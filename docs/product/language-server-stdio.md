# Language Server stdio product slice

The stdio transport makes the Language Server foundation directly launchable by
Studio and IDE clients. It closes the gap between a reusable in-memory session
and a real LSP process while preserving the modular boundary needed by naruon
and other CWL hosts.

## Implemented

- `dweave-lsp` executable;
- bounded LSP Content-Length framing;
- fatal UTF-8 JSON and strict JSON-RPC 2.0 validation;
- deterministic request/notification dispatch;
- fixed JSON-RPC error mapping;
- serialized output and bounded pending work;
- graceful shutdown/exit semantics;
- explicit programmatic process adapters;
- source-free failures and no protocol-body logging.

## Deferred

- cancellation and progress;
- parallel request execution;
- TCP, WebSocket, and browser-worker transports;
- completion, hover, symbols, navigation, rename, and workspace indexing;
- Studio process packaging and cross-platform installer integration.
