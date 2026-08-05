# Document-symbol compatibility operations

## Purpose

The DiagramWeave Language Server serves one PlantUML outline through two LSP
3.18 response shapes. Capability negotiation happens once during initialize and
applies for the lifetime of the session.

| Client initialize capability | Response |
|---|---|
| `hierarchicalDocumentSymbolSupport: true` | hierarchical `DocumentSymbol[]` |
| absent, false, malformed, or unreadable | flat `SymbolInformation[]` |

`documentSymbolProvider: true` is advertised in both cases.

## Modern client initialization

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "capabilities": {
      "textDocument": {
        "documentSymbol": {
          "hierarchicalDocumentSymbolSupport": true
        }
      }
    }
  }
}
```

A nested package can then return optional frozen `children` and an enclosing
parent range.

## Legacy client initialization

A client may omit the capability or send it as false:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "capabilities": {}
  }
}
```

The same source is returned as source-order `SymbolInformation[]`. Each record
contains `name`, `kind`, and `location`. A non-root record also contains the
immediate parent's display name in `containerName`.

## Flat response example

```json
[
  {
    "name": "Core",
    "kind": 4,
    "location": {
      "uri": "file:///workspace/model.puml",
      "range": {
        "start": { "line": 0, "character": 0 },
        "end": { "line": 2, "character": 1 }
      }
    }
  },
  {
    "name": "Api",
    "kind": 5,
    "location": {
      "uri": "file:///workspace/model.puml",
      "range": {
        "start": { "line": 1, "character": 2 },
        "end": { "line": 1, "character": 11 }
      }
    },
    "containerName": "Core"
  }
]
```

The response is a compatibility presentation of the same authoritative symbol
tree. The server does not reparse the source for legacy clients.

## Safety and limits

- A source URI is an identifier only and is never dereferenced, read, or written.
- Only a validated local `.puml` or `.plantuml` `file:` URI is returned in a
  flat location.
- One source snapshot is limited to 1 MiB.
- One document exposes at most 1,024 symbols across roots and descendants.
- One symbol name is limited to 1,024 UTF-8 bytes.
- Output arrays, records, locations, ranges, and positions are deeply frozen.
- The compatibility path performs no LLM, renderer, include, macro, workspace,
  shell, filesystem, or network work.
- Hostile capability getters and proxies fail closed to flat output without
  exposing their exception text.

## Lifecycle

The response shape does not change synchronization or lifecycle behavior:

1. initialize once;
2. send `initialized`;
3. open complete source snapshots;
4. request `textDocument/documentSymbol` only for an open document;
5. send monotonically increasing full-document changes;
6. close, shutdown, and exit normally.

A rejected mutation preserves the previous accepted outline. A late renderer
completion cannot restore stale source after a newer change or close. Shutdown,
exit, and disposal clear all owned snapshots.

## Troubleshooting

### A client expected a tree but received a flat list

Inspect its initialize request. The final capability value must be the boolean
`true`; string values such as `"true"` do not enable hierarchy.

### A client expected a flat list but received a tree

Confirm that an adapter or editor did not inject
`hierarchicalDocumentSymbolSupport: true`. The negotiated mode is immutable for
the session, so restart after changing client capability configuration.

### A flat child has no `containerName`

The scanner did not prove parent ownership, or the symbol is a root. Indentation
alone never creates ownership. Ambiguous, unmatched, or malformed source remains
flat at the authoritative scanner layer.

### A document-symbol request fails

Check lifecycle, local URI policy, file extension, source size, symbol count,
symbol-name size, and document version. Errors remain fixed and source-free;
logs must not include source, raw labels, rejected URIs, renderer output, or
credentials.

## Verification before merge

Run:

```bash
npm run verify
node scripts/check-package-contents.mjs
```

The exact head must pass Node.js 22 and 24 CI, SAST Semgrep, Security Scan,
CodeRabbit, package dry runs, production line/branch/function coverage 100%,
production JSDoc coverage 100%, zero skipped or todo tests, and zero unresolved
review threads.
