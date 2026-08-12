# Conservative same-document PlantUML references design

- **Status:** Approved by the standing autonomous product-development mandate
- **Date:** 2026-08-07
- **Issue:** #21
- **Target:** `@contextualwisdomlab/diagramweave-language-server`

## 1. Buyer-visible problem

DiagramWeave now resolves a uniquely proven explicit PlantUML identifier to its declaration, but users cannot inspect all of that identifier's uses before changing an alias or assessing diagram blast radius. Manual search is noisy because display labels, relation labels, comments, directives, quoted narrative, and implicit participants can contain the same text without sharing declaration identity.

The next bounded portion of PRD FR-012 is standard Find All References over the latest accepted source snapshot. The feature must remain deterministic, local, transport-neutral, source ordered, and conservative.

## 2. Standards contract

Language Server Protocol 3.18 defines:

- client capability `textDocument.references`;
- server capability `referencesProvider`;
- request method `textDocument/references`;
- `ReferenceParams`, including mandatory `context.includeDeclaration`;
- response `Location[] | null` and optional partial results.

The protocol describes project-wide references. DiagramWeave implements a safe same-document subset because the current Language Server owns synchronized document text but does not own workspace files, include resolution, or an index lifecycle.

PlantUML's official class-diagram documentation states that an assigned alias must be used for later references. Sequence-diagram participants and use cases likewise support `as` aliases used in later messages and relations.

## 3. Options considered

### Option A — Independent reference scanner

Add a new `references.js` parser that recreates declaration and reference rules.

**Advantages**

- small localized implementation;
- no refactor of the working definition engine.

**Rejected because**

- definition and references could disagree about aliases, comments, labels, and ambiguity;
- it creates a second identifier source of truth;
- future rename would have to reconcile two scanners.

### Option B — Workspace-wide index

Index every PlantUML file and resolve includes, aliases, and cross-file references.

**Advantages**

- matches the full LSP user expectation;
- creates a direct foundation for workspace rename.

**Rejected because**

- introduces file ownership, path normalization, include policy, cancellation, invalidation, symlink handling, and index persistence;
- substantially expands the privacy and security boundary;
- cannot be proven in one bounded PR.

### Option C — Shared accepted-snapshot navigation evidence

Extend the existing conservative navigation engine so definitions and references share one authoritative identifier and occurrence model.

**Decision:** implement Option C.

The document-symbol tree remains the sole source of declaration existence and declaration ranges. The navigation engine derives only conservative identifiers from those authoritative declaration lines, and then finds structurally valid occurrences in the already accepted source snapshot.

## 4. Public behavior

### Capability negotiation

A valid plain `textDocument.references` client capability enables:

```json
{
  "referencesProvider": true
}
```

Absent, malformed, array-valued, proxied, revoked, or throwing capability records disable the feature. Requests in a session that did not negotiate references return fixed `method_not_found`.

### Request

The server accepts standard `textDocument/references` parameters:

```json
{
  "textDocument": {
    "uri": "file:///workspace/model.puml"
  },
  "position": {
    "line": 8,
    "character": 5
  },
  "context": {
    "includeDeclaration": true
  }
}
```

The request must be a plain record. `context` must be a plain record and `includeDeclaration` must be a boolean. The URI and position use the existing local-document and UTF-16 contracts.

### Result

The result is a deeply frozen source-order `Location[]`.

- `includeDeclaration: true` includes the authoritative declaration `selectionRange` exactly once.
- `includeDeclaration: false` excludes the declaration and returns only structurally proven uses.
- a valid request without a unique supported identity returns one shared frozen empty array;
- output never contains duplicate ranges;
- output is limited to 4,096 locations;
- exceeding the limit raises source-free `reference_limit_exceeded` rather than silently truncating.

The first slice does not stream `partialResultToken` results. A later workspace design may add streaming when a real index exists.

## 5. Identity and occurrence rules

A declaration contributes a navigable identifier only under the definition feature's existing conservative rules:

1. safe bare declaration token without `as`;
2. delimited display label followed by a safe bare alias;
3. safe bare alias followed by a delimited display label.

Duplicate identifiers remain ambiguous. No declaration is selected and no references are returned.

A cursor may identify a declaration through:

- the authoritative declaration display-label `selectionRange`;
- the supported bare alias token on the declaration line;
- a structurally valid exact identifier occurrence in a relation or sequence endpoint;
- member-owner shorthand before `:`.

Reference collection includes exact occurrences only in bounded structural segments. It excludes:

- the declaration line, except through `includeDeclaration`;
- line and block comments;
- quoted narrative;
- directives beginning with `@` or `!`;
- relation and message labels after `:`;
- malformed declarations and alias forms;
- implicit participants;
- includes, macros, and renderer-dependent syntax;
- unsupported punctuation-heavy identifiers.

## 6. Architecture

```text
base diagnostic session
  -> document-symbol session
  -> completion session
  -> folding session
  -> hover session
  -> definition session
  -> reference session
```

```text
authoritative DocumentSymbol[] tree
        |
        v
conservative identifier catalog
        |
        +--> resolve cursor identity
        |
        +--> collect bounded source-order occurrences
                 |
                 +--> definition Location
                 +--> reference Location[]
```

### Navigation engine

`packages/language-server/src/definitions.js` already owns the bounded declaration-derived identifier grammar and masking rules. It will expose a second public pure function:

```js
referencesForSource(source, uri, position, includeDeclaration)
```

The function reuses the same helpers and never reconstructs declaration truth independently. `definitionForSource` and `referencesForSource` therefore cannot diverge on supported identifiers or ambiguity.

### Reference session

`packages/language-server/src/reference-session.js` composes the definition session and owns only the accepted source snapshots needed by `textDocument/references`. It follows the proven epoch and per-document mutation-sequence pattern used by symbols, completion, folding, hover, and definitions.

### Public entry point

`createLanguageServerSession` composes references over definitions. The package exports the pure engine and direct reference-session factory for testing and modular host reuse. The stdio package automatically receives the capability through the shared session and existing JSON-RPC dispatcher.

## 7. Snapshot and concurrency invariants

Only document mutations accepted by the complete inner session become visible to reference requests.

- rejected open or change cannot replace a valid snapshot;
- an earlier valid mutation cannot publish while a newer mutation remains active;
- a newer accepted mutation supersedes older renderer completion;
- close during validation prevents resurrection;
- shutdown, exit, and disposal invalidate all reference state;
- requests never observe partially accepted source;
- output always corresponds to one complete accepted snapshot.

## 8. Privacy, security, and compliance boundary

The feature:

- never dereferences a URI;
- never reads a file or workspace;
- never invokes PlantUML or an LLM;
- never evaluates includes, macros, or preprocessors;
- never starts a shell or uses the network;
- never returns source text, identifier strings, aliases, or host exceptions in errors;
- fails by omission when identity is ambiguous;
- returns only a validated local URI and bounded source ranges.

This narrow boundary supports offline use and evidence minimization without masking the source text needed for the user's work. PII is not transformed or sent elsewhere; access is confined to the already synchronized in-memory document and the host's existing authorization boundary.

## 9. Limits

- maximum document bytes: existing `languageServerLimits.maxDocumentBytes`;
- maximum authoritative symbols: existing `languageServerLimits.maxSymbols`;
- maximum identifier bytes: existing `languageServerLimits.maxSymbolNameBytes`;
- maximum returned reference locations: `4_096`;
- traversal: iterative, never recursive;
- response order: ascending line, then character;
- result objects and nested ranges: deeply frozen.

## 10. Testing strategy

### Pure engine

- bare declarations and both supported alias orientations;
- cursor on display label, declaration alias, relation endpoint, sequence endpoint, and member-owner shorthand;
- `includeDeclaration` true and false;
- repeated references, self references, nested package and namespace declarations;
- exact source order and deduplication;
- LF, CRLF, CR, multilingual labels, Unicode identifiers, and UTF-16 boundaries;
- comments, block comments, quoted narrative, directives, labels, implicit participants, malformed aliases, unsupported tokens, duplicate identifiers, and no-match positions;
- hostile and revoked position records;
- 4,096-location boundary and overflow;
- 512-level symbol hierarchy without recursive traversal.

### Session

- capability negotiation and immutable initialize result;
- lifecycle errors before initialize, before initialized, after shutdown, after exit, and after disposal;
- malformed URI, position, context, and `includeDeclaration`;
- accepted open/change/close snapshots;
- rejected mutation preservation;
- out-of-order renderer completions;
- close during validation;
- direct hostile mutation boundaries.

### Stdio and repository

- real framed `textDocument/references` round trip;
- unsupported capability maps to fixed method-not-found;
- invalid request maps to `-32602` without dynamic source;
- exact package contents include the engine and session;
- root, package, stdio, product, operations, architecture, PRD, research, design, plan, and changelog contracts stay aligned.

Production line, branch, and function coverage and public JSDoc must reach exactly 100%. No skipped, todo, ignored, or expected-failure test is accepted.

## 11. Product Design boundary

This backend protocol slice introduces no custom visual surface. No Figma artifact is required.

Product Design and Figma become mandatory before implementing:

- a Studio references panel;
- grouped source previews;
- keyboard focus and return navigation;
- multi-file grouping;
- a visual reference graph;
- rename preview and collision handling.

## 12. Release boundary

The capability remains under `Unreleased` and packages remain `0.0.0`. It does not independently satisfy commercial release prerequisites such as Studio integration, cross-platform packaging, signing, provenance and SBOM publication, rollback rehearsal, support policy, and end-to-end user evidence.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol specification 3.18: Find references request*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (2026). *Class diagram syntax and features*. https://plantuml.com/class-diagram

PlantUML. (2026). *Sequence diagram syntax and features*. https://plantuml.com/sequence-diagram

PlantUML. (2026). *Use case diagram syntax and features*. https://plantuml.com/use-case-diagram
