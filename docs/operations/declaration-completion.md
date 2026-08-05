# Declaration-completion operations guide

## Purpose

DiagramWeave declaration completion is a local Language Server feature. It
returns bounded PlantUML declaration keywords from the source snapshot already
synchronized by the client. It does not call Contextual Orchestrator, use
`NVIDIA_NIM_API_KEY`, contact a model provider, start the PlantUML renderer,
read a file URI, or access the network.

## Client activation

The client must declare text-document completion support during initialize:

```json
{
  "capabilities": {
    "textDocument": {
      "completion": {}
    }
  }
}
```

A successful initialize response then includes:

```json
{
  "capabilities": {
    "completionProvider": {
      "resolveProvider": false
    }
  }
}
```

If the client omits the capability, DiagramWeave intentionally omits
`completionProvider`. Diagnostics and document symbols remain available. The
server does not support dynamic completion registration or
`completionItem/resolve` in this slice.

## Required lifecycle

A completion request is valid only after this sequence:

1. request `initialize`;
2. notify `initialized`;
3. notify `textDocument/didOpen` with a local `.puml` or `.plantuml` URI and a
   complete source snapshot;
4. request `textDocument/completion` with the same URI and a UTF-16 position.

The client must send monotonically increasing safe-integer versions for
`textDocument/didChange`. DiagramWeave accepts full-document changes only.
Closing a document immediately removes its completion source. Shutdown, exit,
and disposal invalidate every completion snapshot and in-flight mutation.

## Example request

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "textDocument/completion",
  "params": {
    "textDocument": {
      "uri": "file:///workspace/system.puml"
    },
    "position": {
      "line": 3,
      "character": 5
    }
  }
}
```

For a line containing two spaces followed by `com`, the result contains the
canonical `component` keyword and a text edit replacing exactly characters 2
through 5. The client should apply the returned `textEdit`; it should not infer
a replacement range from the label.

## Expected empty results

An empty array is normal and is not an operational failure. DiagramWeave
returns no candidates when the cursor is inside a comment or quoted label,
after relation or directive syntax, within a completed declaration, in the
middle of a keyword, or after a safe prefix that has no catalog match.

This conservative behavior protects manual source from context-insensitive
rewrites. A host must not replace the empty result with an LLM-generated edit
without a separate, explicit proposal and review flow.

## Limits

| Resource | Limit |
|---|---:|
| Complete source snapshot | 1 MiB UTF-8 |
| Open documents per session | 256 |
| Completion items per request | 64 |
| URI | 4,096 UTF-8 bytes |

The completion catalog is currently smaller than the 64-item ceiling. The
limit is a public resource contract for future compatible catalog additions.
All returned objects are immutable.

## Error handling

Hosts should branch on stable `LanguageServerError.code` values rather than
message text.

| Code | Meaning |
|---|---|
| `server_not_initialized` | initialize has not completed |
| `server_not_ready` | initialized notification has not been accepted |
| `server_shutting_down` | shutdown, exit, or disposal has begun |
| `invalid_request` | completion or document parameters have an invalid shape |
| `document_uri_invalid` | URI is remote, unsupported, controlled, or oversized |
| `document_position_invalid` | line or UTF-16 character is absent or out of range |
| `document_not_open` | the requested document has no accepted open snapshot |
| `document_too_large` | source exceeds the session ceiling |

The stdio adapter maps malformed completion parameters and invalid positions to
JSON-RPC `-32602` with a fixed `Invalid params.` message. It does not echo source,
URI values, host exceptions, or hostile getter content.

## Troubleshooting

### No `completionProvider` in initialize

Confirm that the initialize request contains a plain
`capabilities.textDocument.completion` object. Arrays, proxies that throw, and
omitted capability paths are treated as unsupported.

### Empty result for a visible prefix

Check whether the cursor is before another ASCII keyword character. Completion
is suppressed in the middle of a keyword. Also check for an earlier unclosed
PlantUML block comment, a quote, relation text, or non-leading syntax.

### Position rejected after emoji

LSP positions are UTF-16 code units, not Unicode scalar values or UTF-8 bytes.
Clients must use their editor's LSP position conversion rather than code-point
counting.

### Stale result concerns

The server computes completion from the latest successfully accepted source
snapshot. Clients should still discard responses associated with a document
version they no longer display. The stdio connection serializes inbound work,
while the transport-neutral session independently prevents late mutations from
restoring older source.

## Security and privacy

- URIs are identifiers only and are never dereferenced.
- No source is logged or placed in error messages.
- No completion request leaves the process.
- No credentials or environment values are read.
- No renderer, macro, include, shell, or model provider is invoked.
- Hostile getters and proxies fail closed with bounded product errors.

## Verification

Repository verification must pass on Node.js 22 and 24 with:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm pack --workspace packages/language-server --dry-run --json
npm pack --workspace packages/language-server-stdio --dry-run --json
```

`npm run verify` enforces complete tests, 100% production line/branch/function
coverage, and production JSDoc coverage. No skipped completion test is accepted.
