# Same-document reference operations

## Purpose

This runbook operates DiagramWeave's capability-gated LSP 3.18 `textDocument/references` slice. The feature returns every structurally proven use of one uniquely identified explicit PlantUML declaration in the latest accepted same-document snapshot. It does not read files, resolve includes, scan workspaces, invoke PlantUML, or call an LLM.

## Activation

The client must send a plain references capability during `initialize`:

```json
{
  "capabilities": {
    "textDocument": {
      "references": {}
    }
  }
}
```

A successful negotiation adds:

```json
{
  "capabilities": {
    "referencesProvider": true
  }
}
```

Missing, malformed, array-valued, proxied, revoked, throwing, or otherwise unsafe capability data fails closed. The provider is not advertised, and later reference requests return the stable `method_not_found` error.

## Request lifecycle

The host must:

1. send `initialize`;
2. send `initialized`;
3. open the complete local PlantUML snapshot with `textDocument/didOpen`;
4. send every accepted edit as one full-document `textDocument/didChange` with a strictly increasing version;
5. request `textDocument/references` with a local document URI, UTF-16 position, and boolean `context.includeDeclaration`;
6. send `didClose` when the host no longer owns the snapshot;
7. complete `shutdown` and `exit` normally.

The URI is an identifier only and is never dereferenced. Only local `.puml` or `.plantuml` `file:` URIs accepted by the shared Language Server contract are valid.

## Successful results

A uniquely proven declaration or reference returns a deeply frozen source-order `Location[]`:

```json
[
  {
    "uri": "file:///workspace/model.puml",
    "range": {
      "start": { "line": 3, "character": 9 },
      "end": { "line": 3, "character": 22 }
    }
  },
  {
    "uri": "file:///workspace/model.puml",
    "range": {
      "start": { "line": 8, "character": 12 },
      "end": { "line": 8, "character": 25 }
    }
  }
]
```

`context.includeDeclaration: true` includes the authoritative declaration selection range exactly once. `context.includeDeclaration: false` excludes it. A valid request returns an empty array when the cursor is not on one unique explicit identifier or when no proven use remains after declaration exclusion. This conservative empty result is not an operational failure.

Results are bounded to 4,096 locations. A 4,097th location fails closed with `reference_limit_exceeded`; DiagramWeave never truncates the result because an incomplete reference set would be unsafe evidence for rename, refactoring, or blast-radius decisions.

## Stable errors

| DiagramWeave code | JSON-RPC code | Operator interpretation |
|---|---:|---|
| `server_not_initialized` | `-32002` | Client requested work before `initialize` completed. |
| `server_not_ready` | `-32002` | Client omitted the `initialized` notification. |
| `server_shutting_down` | `-32002` | Client requested work after shutdown, exit, or disposal. |
| `method_not_found` | `-32601` | References were not negotiated. |
| `invalid_request` | `-32600` | Request envelope or document mutation shape is invalid. |
| `document_position_invalid` | `-32602` | Position is malformed or outside the accepted snapshot. |
| `document_uri_invalid` | `-32602` | URI violates the local PlantUML identifier contract. |
| `document_not_open` | `-32602` | No accepted snapshot exists for the URI. |
| `document_version_out_of_order` | `-32602` | Full-document version is not strictly increasing. |
| `incremental_change_unsupported` | `-32602` | A range edit was supplied to the full-sync foundation. |
| `reference_limit_exceeded` | `-32602` | More than 4,096 proven locations would be returned. |

Public errors contain fixed messages and stable metadata only. Source text, identifier names, URI values, renderer paths, host exceptions, and credentials are not echoed.

## Conservative identity boundary

Reference identity is shared with Go to Definition and the authoritative document-symbol tree. Operators should expect omission rather than heuristic matching when source meaning cannot be proved.

The reference set excludes comments, block comments, quoted narrative, display labels, directives, relation or message labels, malformed aliases, implicit participants, unsupported punctuation-heavy identities, duplicate declarations, includes, macros, preprocessors, renderer-derived identities, and all cross-document evidence. Identifier equality is exact and case-sensitive.

## Concurrency invariants

References publish a source snapshot only after every inner session layer accepts the mutation. The outer layer uses a session epoch and per-document mutation sequencing.

Operationally:

- rejected mutations leave the previous accepted reference snapshot intact;
- a newer active mutation prevents older work from becoming current;
- a newer accepted change supersedes an older renderer completion;
- close, shutdown, exit, and disposal invalidate all reference evidence;
- a late completion cannot resurrect a closed or superseded snapshot;
- one request never observes a partially accepted mutation.

A reference result is therefore tied to the latest accepted source, not merely the latest request that began.

## Observability

The feature is deliberately silent for conservative empty results. Hosts may measure aggregate counts without recording source-derived names:

- negotiated reference sessions;
- reference requests;
- returned location counts;
- empty results;
- `includeDeclaration` choice counts;
- stable error codes;
- request latency;
- open-document count.

Do not log source excerpts, aliases, relation labels, complete URIs, cursor-adjacent text, or returned identifier strings. Redact or hash document identifiers according to the host's privacy policy.

## Security verification

Before merge or release, verify:

- no renderer process starts during a reference request;
- no filesystem, workspace, shell, include, macro, or network API is invoked;
- no LLM credential is required;
- comments, directives, relation labels, and quoted narrative cannot become references;
- duplicate identifiers return an empty result;
- hostile getters and proxies do not leak dynamic error text;
- UTF-16 positions remain exact for emoji and multilingual identifiers;
- `includeDeclaration` is required and honored exactly;
- 4,096 locations succeed and overflow fails without truncation;
- all returned arrays, locations, and ranges are deeply frozen;
- real stdio responses preserve fixed JSON-RPC error mappings;
- production statement/line, branch, function, and public JSDoc coverage are all 100%.

No skipped reference test is accepted as release evidence.

## Rollback

The slice is independently removable by restoring the public Language Server entry point from `createReferenceLanguageServerSession` to `createDefinitionLanguageServerSession` and removing the reference-specific session, engine exports, tests, and documentation in one reviewed change. Do not partially disable `referencesProvider` while leaving `textDocument/references` dispatch active, or vice versa.

A rollback must rerun the complete repository verification and package dry runs on the exact rollback head. Existing diagnostics, document symbols, completion, folding, hover, definition, and stdio contracts must remain green.

## Escalation

Escalate rather than broadening the implementation when a user needs:

- workspace-wide or cross-document references;
- include or macro resolution;
- file watchers or persistent indexing;
- cancellation or partial-result streaming;
- semantic member or method identity;
- rename or mutation based on the reference set;
- a Studio references panel, grouped preview, navigation history, or visual reference graph.

Each requires a separate product, authorization, lifecycle, and safety contract. Custom Studio interaction requires Product Design and Figma before implementation.
