# Folding ranges operations

## Purpose

The DiagramWeave Language Server can return conservative package and namespace
folding ranges for an open PlantUML source snapshot. Folding is optional and is
available only to clients that negotiate a valid LSP 3.18
`textDocument.foldingRange` capability during initialize.

## Client initialization

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "capabilities": {
      "textDocument": {
        "foldingRange": {
          "rangeLimit": 1024,
          "lineFoldingOnly": true
        }
      }
    }
  }
}
```

A successful initialize result then includes:

```json
{
  "capabilities": {
    "foldingRangeProvider": true
  }
}
```

A missing or hostile capability path—including malformed, array-valued,
proxied, revoked, or throwing records—does not advertise the provider. A request
in that session returns the fixed `method_not_found` Language Server error.

## Request

After `initialized` and `textDocument/didOpen`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "textDocument/foldingRange",
  "params": {
    "textDocument": {
      "uri": "file:///workspace/model.puml"
    }
  }
}
```

A proven source such as:

```plantuml
package Platform {
  namespace api {
    class Gateway
  }
  class Worker
}
```

returns:

```json
[
  { "startLine": 0, "endLine": 5 },
  { "startLine": 1, "endLine": 3 }
]
```

The declaration line remains visible. The server omits character offsets,
folding kind, and collapsed text.

## Structural policy

A fold is returned only when the existing authoritative document-symbol scanner
has proven a complete nonempty package or namespace scope.

The server does not fold based on:

- indentation alone;
- class, component, actor, participant, or other non-grouping declaration bodies;
- quoted or commented braces;
- balanced one-line blocks;
- unmatched, cross-indented, multiple-opening, or crossed braces;
- malformed labels;
- relations, members, directives, includes, macros, or renderer output.

An empty two-line scope does not fold because only its closing brace would be
hidden. A scope with at least one interior line is eligible.

## Range limits

`rangeLimit` is optional.

| Value | Behavior |
|---|---|
| absent | up to 1,024 source-order ranges |
| `0` | shared immutable empty result |
| positive LSP unsigned integer | exact source-order prefix, capped at 1,024 |
| negative, fractional, string, unsafe, or above 2,147,483,647 | capability rejected fail-closed |

`lineFoldingOnly` may be absent or boolean. DiagramWeave's line-only output is
identical for both boolean values. Another type rejects the capability.

## Lifecycle

1. Initialize once with a valid folding capability.
2. Send `initialized`.
3. Open a complete `.puml` or `.plantuml` source snapshot.
4. Request folding only for that open local document URI.
5. Send full-document changes with monotonically increasing versions.
6. Close the document when finished.
7. Shutdown and exit normally.

The folding layer mirrors source only after every inner Language Server layer
accepts the mutation. A rejected newer mutation preserves the last accepted
folding source. A newer accepted change supersedes an older renderer completion.
A close completed during validation prevents source resurrection. Shutdown,
exit, and disposal clear every folding snapshot.

## Safety and limits

- A document URI is an identifier only and is never dereferenced, read, or
  written.
- Only bounded local `.puml` and `.plantuml` `file:` identifiers are accepted.
- One source snapshot is limited to 1 MiB.
- One document contains at most 1,024 symbols and therefore at most 1,024 folds.
- One session accepts at most 256 open documents.
- Public folding arrays and records are deeply frozen.
- Folding performs no LLM, renderer, include, macro, shell, workspace,
  filesystem, or network work.
- Errors do not include source, comments, labels, raw renderer diagnostics,
  executable paths, rejected URI values, credentials, or host exception text.

## Troubleshooting

### The server did not advertise folding

Inspect initialize parameters. `textDocument.foldingRange` must be a plain JSON
object. Validate optional `rangeLimit` and `lineFoldingOnly` types. Restart the
session after correcting capabilities because negotiation is immutable.

### The response is empty

Confirm that the file contains a complete package or namespace block with at
least one interior line and an indentation-matched standalone closing brace.
Indentation alone, an empty two-line block, and a balanced one-line block do not
produce folds. A zero `rangeLimit` also returns an empty result.

### A visible block is not foldable

The source may be structurally ambiguous or may depend on PlantUML macros,
includes, renderer interpretation, or a non-grouping body. DiagramWeave fails by
omission rather than fabricating ownership.

### A request fails

Check lifecycle, open-document state, local URI policy, extension, source size,
symbol limits, and document version. Do not add source or rejected values to
logs when investigating.

## Exact-head verification

Before merge, run:

```bash
npm run verify
node scripts/check-package-contents.mjs
```

The same immutable head must pass Node.js 22 and 24 CI, SAST Semgrep, Security
Scan, CodeRabbit, production line/branch/function coverage 100%, production
JSDoc coverage 100%, exact package contents, zero skipped or todo tests, and zero
unresolved review threads.
