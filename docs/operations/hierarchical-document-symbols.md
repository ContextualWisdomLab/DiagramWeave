# Hierarchical document-symbol operations guide

## Purpose

DiagramWeave's transport-neutral Language Server returns an outline tree for
complete, explicit PlantUML declaration scopes. Studio, IDE extensions,
`dweave-lsp`, naruon, and other CWL hosts receive the same frozen
`DocumentSymbol[]` contract and do not need to parse package structure
independently.

The feature is local and deterministic. It does not invoke PlantUML, evaluate
includes or macros, read the document URI, call an LLM, scan a workspace, or
access the network.

## Client request

After initialize, initialized, and a successful full-document `didOpen`, request:

```json
{
  "jsonrpc": "2.0",
  "id": 21,
  "method": "textDocument/documentSymbol",
  "params": {
    "textDocument": {
      "uri": "file:///workspace/platform.puml"
    }
  }
}
```

For this source:

```plantuml
package Platform {
  namespace api {
    class Gateway
  }
  class Worker
}
class External
```

DiagramWeave returns two roots. `Platform` owns `api` and `Worker`; `api` owns
`Gateway`; `External` remains a root. Parent ranges extend through their matched
closing-brace lines, while each selection range covers only its display label.

## Proven-scope requirements

A hierarchy edge exists only when all of the following are true:

1. the parent is an existing explicit declaration recognized by the outline;
2. its comment-masked line has exactly one unquoted structural token, `{`;
3. structural braces close in stack order;
4. the matching line contains only indentation, `}`, whitespace, and optional
   comments that were safely masked;
5. closing indentation exactly matches opening indentation;
6. the child declaration lies strictly inside the completed interval.

Indentation by itself never creates ownership. A later `}` is not searched
backwards across an unclosed nested or anonymous brace.

## Expected flat results

A flat root or leaf is normal when the source contains:

- a quoted label such as `package "Displayed { Brace"`;
- a line or block comment containing braces;
- a balanced one-line block such as `package Empty { }`;
- an unmatched opener or closer;
- multiple opening braces on the same declaration line;
- a closing brace at different indentation;
- crossed, malformed, macro-generated, include-generated, or renderer-dependent
  structure.

The scanner preserves explicit declarations even when it declines to infer an
owner. Hosts should not treat a missing `children` field as an error.

## Range and position semantics

All positions are LSP UTF-16 code units:

- `selectionRange` is the visible declaration label;
- leaf `range` is the declaration line;
- proven parent `range` ends at the original closing line's full UTF-16 length,
  including a trailing comment;
- every child range is contained by its parent range;
- CR, LF, and CRLF line delimiters produce the same zero-based line numbers.

Clients must use their editor's LSP conversion and must not count UTF-8 bytes or
Unicode scalar values. This matters for Korean text, other multilingual labels,
and emoji.

## Lifecycle and concurrency

The hierarchical outline uses the existing accepted document snapshot:

1. `initialize`;
2. `initialized`;
3. full-document `didOpen`;
4. optional monotonically increasing full-document `didChange`;
5. `documentSymbol` requests;
6. `didClose`, shutdown, exit, or disposal invalidates the source.

Epoch and sequence tracking prevents a late open or change from restoring an
older outline after a newer accepted mutation or close. A rejected newer
mutation does not erase an earlier valid snapshot.

## Limits

| Resource | Limit |
|---|---:|
| Complete source snapshot | 1 MiB UTF-8 |
| Open documents per session | 256 |
| Explicit symbols across roots and descendants | 1,024 |
| One symbol name | 1,024 UTF-8 bytes |
| Local URI identifier | 4,096 UTF-8 bytes |

Deep trees are built and frozen bottom-up without recursive product traversal.
The total symbol ceiling bounds memory and traversal work regardless of depth.

## Error handling

Hierarchy adds no new public error family. Hosts continue to branch on stable
Language Server codes:

| Code | Meaning |
|---|---|
| `server_not_initialized` | initialize has not completed |
| `server_not_ready` | initialized notification has not been accepted |
| `server_shutting_down` | shutdown, exit, or disposal has begun |
| `invalid_request` | request or synchronization parameters are malformed |
| `document_uri_invalid` | URI is remote, unsupported, controlled, or oversized |
| `document_not_open` | no accepted source snapshot exists |
| `document_too_large` | source exceeds the session ceiling |
| `document_symbols_too_many` | explicit declaration count exceeds 1,024 |
| `document_symbol_name_too_large` | a display label exceeds its byte ceiling |

Malformed braces are not protocol errors. They produce conservative flat output.

## Troubleshooting

### A package has no children

Confirm that its declaration has exactly one unquoted `{`, its closing line is
standalone after comments are removed, and both lines use identical indentation.
A tab and equivalent spaces are intentionally different evidence.

### An inner package appears as a root

The inner scope may be complete while the outer scope is unmatched or
structurally ambiguous. DiagramWeave retains the proven inner interval but will
not assign it to an unproven outer owner.

### A range includes a trailing close-line comment

This is expected. LSP `range` encloses the complete declaration and DiagramWeave
uses the original line length. The comment text itself is not returned; only the
position extends through the line.

### The client shows a flat list

The server returns `DocumentSymbol.children`. Verify that the client supports
hierarchical document symbols and does not flatten results for presentation.
A future separate compatibility slice may provide `SymbolInformation[]` for
legacy clients.

## Security and privacy

- document URIs are identifiers only and are never dereferenced;
- source and labels are never written to logs or errors;
- comments and quotes are scanned locally with bounded memory;
- no renderer stderr, include, macro, environment, credential, or provider data
  enters the outline;
- malformed and ambiguous structure fails by omission;
- returned arrays, symbols, ranges, and positions are immutable.

## Verification

Before merge and release-candidate use, one exact head must pass:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
node scripts/check-package-contents.mjs
```

The repository requires Node.js 22 and 24 CI, zero skipped tests, 100%
production line/branch/function coverage, complete production JSDoc, exact npm
package dry runs, SAST, Security Scan, CodeRabbit, and zero unresolved review
threads.
