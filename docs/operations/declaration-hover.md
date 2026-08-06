# Declaration hover operations

## Purpose

This guide integrates DiagramWeave's evidence-bounded PlantUML declaration hover into an embedded host or the `dweave-lsp` stdio process. The feature is transport-neutral, local, deterministic, and derived only from the authoritative document-symbol tree.

It does not read a URI, invoke PlantUML, call a model, resolve includes or macros, inspect a workspace, start a shell, or contact the network.

## Runtime boundary

The independently reusable package is:

```text
@contextualwisdomlab/diagramweave-language-server
```

The bounded process adapter is:

```text
@contextualwisdomlab/diagramweave-language-server-stdio
```

DiagramWeave Studio, IDE extensions, naruon, and other CWL hosts should reuse one of these boundaries. They should not duplicate declaration parsing or source snapshots.

## Initialize

A client enables hover with a plain `textDocument.hover` capability.

```json
{
  "processId": null,
  "capabilities": {
    "textDocument": {
      "hover": {
        "contentFormat": ["markdown", "plaintext"]
      }
    }
  }
}
```

A successful initialize response contains:

```json
{
  "capabilities": {
    "hoverProvider": true
  }
}
```

The complete response also retains diagnostics, full-document synchronization, document-symbol, completion, and folding capabilities negotiated by the inner layers.

### Format selection

- An absent `contentFormat` selects `plaintext`.
- A present list may contain 1 through 16 string entries.
- The first supported `markdown` or `plaintext` entry wins.
- Unsupported, empty, oversized, non-string, malformed, array-valued, proxied, revoked, or throwing capability data disables hover.
- A request in a session that did not negotiate hover returns fixed `method_not_found`.

## Lifecycle

The host follows the normal Language Server lifecycle:

1. `initialize` request;
2. `initialized` notification;
3. full-document `textDocument/didOpen`;
4. optional full-document `textDocument/didChange` with increasing versions;
5. hover requests;
6. `textDocument/didClose`;
7. `shutdown` request;
8. `exit` notification.

Hover before initialize returns `server_not_initialized`. Hover after initialize but before `initialized` returns `server_not_ready`. Hover after shutdown, exit, or disposal returns `server_shutting_down`.

## Document synchronization

The Language Server accepts complete local `.puml` or `.plantuml` snapshots. It does not dereference document URIs.

```json
{
  "textDocument": {
    "uri": "file:///workspace/model.puml",
    "languageId": "plantuml",
    "version": 1,
    "text": "package Platform {\n  class Gateway\n}"
  }
}
```

Only a successful mutation accepted by diagnostics, symbols, completion, and folding becomes the hover source. The outer session uses epochs and monotonically increasing mutation sequences so:

- rejected opens and changes do not replace a valid snapshot;
- an older renderer completion cannot overwrite a newer accepted source;
- a newer active mutation suppresses an older completion until the newer result is known;
- a close completed during validation prevents source resurrection;
- shutdown, exit, and disposal invalidate all hover snapshots.

## Request

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "textDocument/hover",
  "params": {
    "textDocument": {
      "uri": "file:///workspace/model.puml"
    },
    "position": {
      "line": 1,
      "character": 9
    }
  }
}
```

Positions are zero-based UTF-16 coordinates. Line and character must be nonnegative safe integers. Character may equal the end of the source line, but such a boundary cannot match an exclusive declaration selection end.

## Plaintext response

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "result": {
    "contents": {
      "kind": "plaintext",
      "value": "PlantUML class declaration\nName: Gateway\nContainer: Platform"
    },
    "range": {
      "start": { "line": 1, "character": 8 },
      "end": { "line": 1, "character": 15 }
    }
  }
}
```

The `Container` line is absent for a root declaration.

## Markdown response

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```text\nPlantUML class declaration\nName: Gateway\nContainer: Platform\n```"
  },
  "range": {
    "start": { "line": 1, "character": 8 },
    "end": { "line": 1, "character": 15 }
  }
}
```

The actual fence is dynamically longer than every contiguous backtick run in declaration and container labels. Hosts may render the MarkupContent according to the Language Server Protocol but must not reinterpret source labels as trusted HTML.

## No-match response

A valid position outside an explicit declaration label returns JSON `null`.

```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "result": null
}
```

No match is expected over:

- declaration keywords rather than labels;
- relation endpoints;
- members or methods;
- directives;
- comments and quoted non-declaration text;
- braces and ordinary whitespace;
- malformed or ambiguous declarations;
- renderer-dependent or implicit syntax.

## Error mapping

| DiagramWeave code | Condition | JSON-RPC mapping |
|---|---|---|
| `server_not_initialized` | request before initialize | Server-not-initialized family |
| `server_not_ready` | request before initialized | Server-not-ready family |
| `server_shutting_down` | request after shutdown, exit, or disposal | Server-shutting-down family |
| `method_not_found` | hover not negotiated | `-32601 Method not found` |
| `invalid_request` | malformed request envelope or text-document record | `-32602 Invalid params` |
| `document_position_invalid` | malformed or out-of-source position | `-32602 Invalid params` |
| `document_uri_invalid` | non-local, controlled, oversized, or unsupported URI | `-32602 Invalid params` |
| `document_not_open` | valid identifier without an accepted open snapshot | request failure with stable code |
| `document_too_large` | source exceeds the authoritative session ceiling | bounded document failure |
| `document_symbol_name_too_large` | declaration label exceeds the symbol-name ceiling | bounded symbol failure |

Public errors contain fixed messages and safe scalar metadata only. They do not echo source, labels, URIs, capability values, renderer paths, environment variables, or host exceptions.

## Troubleshooting

### `hoverProvider` is absent

Check that:

- `capabilities`, `textDocument`, and `hover` are plain object or null-prototype records;
- `contentFormat` is absent or a nonempty array of at most 16 strings;
- the list contains `markdown` or `plaintext`;
- no Proxy, revoked object, throwing getter, or unsupported shape is used.

The server deliberately fails closed rather than guessing a client contract.

### `method_not_found`

The session did not negotiate hover. Reinitialize a new session with a valid capability. LSP capabilities are fixed at initialization and are not changed by later notifications.

### `document_not_open`

Send `initialized`, then a successful `textDocument/didOpen` for the same exact URI spelling used by the request. The server validates but preserves the client-provided URI spelling and does not canonicalize filesystem identity.

### `document_position_invalid`

Verify the line exists in the latest accepted full snapshot and the UTF-16 character does not exceed that line's length. Code-point, byte, and grapheme-cluster offsets are not interchangeable with UTF-16 LSP coordinates.

### A valid request returns `null`

Confirm the cursor is inside the displayed declaration label. The selection start is inclusive and the selection end is exclusive. Hover intentionally omits relations, members, directives, comments, malformed source, implicit declarations, and unsupported syntax.

### Container information is absent

Only a child in a complete, stack-ordered package or namespace scope with a matching-indentation standalone closing brace has a proven container. Visual indentation, incomplete braces, class bodies, and renderer output do not create hover container context.

## Host checklist

- Preserve full-document version ordering.
- Use the same URI spelling for open, change, close, and hover.
- Treat `null` as an ordinary no-match result.
- Treat MarkupContent as untrusted source-derived display data.
- Retain keyboard and outline access to declaration information.
- Do not use hover as the sole route to important content.
- Do not persist source snapshots on behalf of the Language Server.
- Do not retry malformed or unsupported requests automatically.
- Restart the session after capability changes.
- Record only stable error codes and operational timing; do not log source or labels by default.

## Observability

A host may safely record:

- request method;
- negotiated markup kind;
- success, null, or stable error code;
- request duration;
- open-document count;
- process exit status.

A host should not record by default:

- source text;
- declaration or container names;
- document URI;
- hover value;
- renderer paths;
- environment values;
- raw JSON-RPC bodies.

## Rollback

The feature is an outer compositional layer. A host that cannot consume hover can omit the capability without losing diagnostics, document symbols, completion, folding, or stdio lifecycle behavior. A package rollback should use the previous exact package version or commit and restart the session; no persisted migration is required because the feature introduces no database or hidden document store.

## References

Microsoft. (2026). *Language Server Protocol specification 3.18*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (2026). *Class diagram syntax and features*. https://plantuml.com/class-diagram

PlantUML. (2026). *Component diagram syntax and features*. https://plantuml.com/component-diagram

PlantUML. (2026). *Sequence diagram syntax and features*. https://plantuml.com/sequence-diagram
