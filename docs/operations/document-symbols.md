# DiagramWeave document-symbol operations

## Capability

After `initialize`, the Language Server advertises:

```json
{
  "documentSymbolProvider": true,
  "positionEncoding": "utf-16"
}
```

Clients must send `initialized`, then a complete `textDocument/didOpen` snapshot
before requesting `textDocument/documentSymbol`. Changes use
`TextDocumentSyncKind.Full`; incremental ranges remain unsupported.

## Request

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "textDocument/documentSymbol",
  "params": {
    "textDocument": {
      "uri": "file:///workspace/context.puml"
    }
  }
}
```

The request works through the in-process session and the `dweave-lsp` stdio
transport. The source URI is an identifier only and is never dereferenced.

## Result contract

The result is a flat, declaration-order `DocumentSymbol[]`. Each record has:

- a bounded display `name`;
- a declaration keyword in `detail`;
- an LSP `SymbolKind`;
- a full declaration-line `range`;
- a label-only `selectionRange` contained by the full range.

All records, ranges, and positions are frozen. Clients may render their own
hierarchical or filtered outline but must not infer that flat results represent
PlantUML package membership.

## Supported declaration families

```text
package namespace class abstract class interface enum annotation entity object
participant actor boundary control database collections queue component node
cloud frame folder artifact file stack storage card agent rectangle usecase state
```

Quoted, parenthesized, bracketed, colon-delimited, bare, and `as`-aliased labels
are supported. Implicit participants, relation endpoints, members, directives,
macros, malformed declarations, and inferred nesting are not returned.

## Limits and failures

| Contract | Limit or error |
|---|---|
| Source snapshot | 1 MiB UTF-8 |
| Symbols per document | 1,024 |
| Symbol display name | 1,024 UTF-8 bytes |
| Missing open document | `document_not_open` |
| Excessive symbols | `document_symbols_too_many` |
| Excessive name | `document_symbol_name_too_large` |
| Invalid or remote URI | `document_uri_invalid` |

Document symbol requests before initialization, before the `initialized`
notification, or after shutdown/exit/disposal fail with the existing lifecycle
codes. No source excerpt, raw parser data, renderer output, path, or credential
is included in public failures.

## Concurrency and recovery

The Language Server binds outline snapshots to accepted open/change/close
mutations. An older renderer completion cannot overwrite a newer source. A
rejected newer mutation does not prevent an earlier valid mutation from
settling. Close, shutdown, exit, and disposal invalidate all outline snapshots.

After an abnormal stdio restart, the client repeats initialize and reopens its
current documents. The server has no hidden disk store or recovery database.

## Verification gate

Merge requires exact-head Node.js 22 and 24 verification, zero skipped/todo
tests, 100% production statement/branch/function coverage, complete production
JSDoc, syntax, package dry runs, SAST, dependency and filesystem security
scans, CodeRabbit, and no unresolved review threads.
