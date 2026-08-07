# Same-document definition operations

## Purpose

This runbook operates DiagramWeave's capability-gated LSP 3.18 `textDocument/definition` slice. The feature resolves a uniquely proven same-document PlantUML identifier to the authoritative declaration selection range. It does not read files, resolve includes, scan workspaces, invoke PlantUML, or call an LLM.

## Activation

The client must send a plain definition capability during `initialize`:

```json
{
  "capabilities": {
    "textDocument": {
      "definition": {}
    }
  }
}
```

A successful negotiation adds:

```json
{
  "capabilities": {
    "definitionProvider": true
  }
}
```

Missing, malformed, array-valued, proxied, revoked, throwing, or otherwise unsafe capability data fails closed. The provider is not advertised, and later definition requests return the stable `method_not_found` error.

## Request lifecycle

The host must:

1. send `initialize`;
2. send `initialized`;
3. open the complete local PlantUML snapshot with `textDocument/didOpen`;
4. send every accepted edit as one full-document `textDocument/didChange` with a strictly increasing version;
5. request `textDocument/definition` with a local document URI and UTF-16 position;
6. send `didClose` when the host no longer owns the snapshot;
7. complete `shutdown` and `exit` normally.

The URI is an identifier only and is never dereferenced. Only local `.puml` or `.plantuml` `file:` URIs accepted by the shared Language Server contract are valid.

## Successful results

A uniquely proven declaration or reference returns one deeply frozen location:

```json
{
  "uri": "file:///workspace/model.puml",
  "range": {
    "start": { "line": 3, "character": 9 },
    "end": { "line": 3, "character": 22 }
  }
}
```

A valid request returns `null` when the cursor is not on a unique explicit identifier. This includes duplicates, comments, quoted narrative, directives, labels, implicit declarations, malformed aliases, unknown names, and unsupported syntax. `null` is an intentional conservative result, not an operational failure.

## Stable errors

| DiagramWeave code | JSON-RPC code | Operator interpretation |
|---|---:|---|
| `server_not_initialized` | `-32002` | Client requested work before `initialize` completed. |
| `server_not_ready` | `-32002` | Client omitted the `initialized` notification. |
| `server_shutting_down` | `-32002` | Client requested work after shutdown, exit, or disposal. |
| `method_not_found` | `-32601` | Definition was not negotiated. |
| `invalid_request` | `-32600` | Request envelope or document mutation shape is invalid. |
| `document_position_invalid` | `-32602` | Position is malformed or outside the accepted snapshot. |
| `document_uri_invalid` | `-32602` | URI violates the local PlantUML identifier contract. |
| `document_not_open` | `-32602` | No accepted snapshot exists for the URI. |
| `document_version_out_of_order` | `-32602` | Full-document version is not strictly increasing. |
| `incremental_change_unsupported` | `-32602` | A range edit was supplied to the full-sync foundation. |

Public errors contain fixed messages and stable metadata only. Source text, URI values, renderer paths, host exceptions, and credentials are not echoed.

## Concurrency invariants

Definition publishes a source snapshot only after every inner session layer accepts the mutation. The outer layer uses an epoch and per-document mutation sequence.

Operationally:

- rejected mutations leave the previous accepted definition snapshot intact;
- a newer active mutation prevents an older completion from becoming current;
- close, shutdown, exit, and disposal invalidate all definition evidence;
- a late renderer completion cannot resurrect a closed or superseded snapshot.

A definition result is therefore tied to the latest accepted source, not merely the latest request that began.

## Observability

The feature is deliberately silent for conservative `null` results. Hosts may measure aggregate counts without recording source-derived names:

- negotiated definition sessions;
- definition requests;
- successful locations;
- null results;
- stable error codes;
- request latency;
- open-document count.

Do not log source excerpts, aliases, relation labels, complete URIs, or cursor-adjacent text. Redact or hash document identifiers according to the host's privacy policy.

## Security verification

Before merge or release, verify:

- no renderer process starts during a definition request;
- no filesystem or network API is invoked;
- no LLM credential is required;
- comments, directives, relation labels, and quoted narrative cannot become identifiers;
- duplicate identifiers return `null`;
- hostile getters and proxies do not leak dynamic error text;
- UTF-16 positions remain exact for emoji and multilingual labels;
- all returned objects are deeply frozen;
- real stdio responses preserve fixed JSON-RPC error mappings;
- production line, branch, function, and public JSDoc coverage are all 100%.

No skipped definition test is accepted as release evidence.

## Rollback

The slice is independently removable by restoring the public Language Server entry point from `createDefinitionLanguageServerSession` to `createHoverLanguageServerSession` and removing the definition-specific session, engine, tests, and documentation in one reviewed change. Do not partially disable capability advertisement while leaving request dispatch active, or vice versa.

A rollback must rerun the complete repository verification and package dry runs on the exact rollback head. Existing diagnostics, document symbols, completion, folding, hover, and stdio contracts must remain green.

## Escalation

Escalate rather than broadening the implementation when a user needs:

- cross-document navigation;
- include or macro resolution;
- workspace indexing;
- scope shadowing;
- member or method identity;
- references or rename;
- a Studio definition peek panel or navigation history.

Each requires a separate product and safety contract. Custom Studio interaction requires Product Design and Figma before implementation.
