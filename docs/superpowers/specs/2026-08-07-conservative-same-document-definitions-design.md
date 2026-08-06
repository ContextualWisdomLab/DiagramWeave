# Conservative same-document PlantUML definitions design

- **Status:** Approved by the standing autonomous product-development mandate
- **Date:** 2026-08-07
- **Issue:** #19
- **Target:** `@contextualwisdomlab/diagramweave-language-server`

## 1. Buyer-visible problem

DiagramWeave exposes diagnostics, document symbols, completion, folding, and declaration hover, but an editor user cannot invoke standard **Go to Definition** from an explicit PlantUML identifier used in a relation or message. Large source files therefore still require manual search even though the server already owns an authoritative declaration tree and revision-safe accepted snapshots.

The first implementation of PRD requirement FR-012 should close the smallest valuable gap: deterministic same-document navigation from a uniquely proven explicit identifier to its declaration. Workspace indexing, include resolution, references, and rename remain later slices.

## 2. Options considered

### Option A — Declaration-label self-navigation only

Return the current declaration selection when the cursor is already on a declaration label.

**Advantages**

- nearly no new parsing;
- minimal implementation risk.

**Rejected because**

- it does not solve the buyer's actual navigation problem;
- users already see the declaration at the cursor;
- it would advertise a standard capability without meaningful relation/message navigation.

### Option B — Conservative alias-aware same-document index

Use the authoritative document-symbol tree for declaration truth and target ranges. Parse only bounded reference identifiers on those already-proven declaration lines, build a unique identifier table, and scan accepted source text for exact safe tokens in structural positions.

**Advantages**

- closes a real editor workflow;
- reuses existing declaration truth and mutation ordering;
- remains local, deterministic, bounded, and transport-neutral;
- creates a safe foundation for later references and rename without prematurely adding workspace state.

**Trade-off**

- intentionally omits ambiguous or syntax-rich PlantUML constructs;
- requires a small reference scanner in addition to the authoritative declaration scanner.

### Option C — Workspace-wide PlantUML navigation

Resolve definitions across files, includes, macros, and a persistent workspace index.

**Rejected because**

- requires file access, include policy, invalidation, path security, and workspace lifecycle;
- substantially expands the trust boundary;
- cannot be proven safely in one bounded PR;
- conflicts with the current local accepted-snapshot architecture.

## 3. Decision

Implement **Option B**.

The authoritative `DocumentSymbol[]` tree remains the only source of declaration existence, display labels, hierarchy, kinds, and target ranges. The new layer derives a reference identifier only from the exact declaration line associated with each authoritative symbol. It never invents a declaration from an arbitrary relation endpoint.

## 4. Supported identifier shapes

A declaration contributes a navigable identifier only when one of these conservative forms is proven:

1. **Bare declaration without `as`**

   ```plantuml
   class OrderService
   ```

   Identifier: `OrderService`.

2. **Delimited display label followed by a safe bare alias**

   ```plantuml
   class "Order Service" as OrderService
   ```

   Identifier: `OrderService`.

3. **Safe bare alias followed by a delimited display label**

   ```plantuml
   participant OrderService as "Order Service"
   ```

   Identifier: `OrderService`.

The implementation omits navigation when:

- both sides of `as` are bare;
- both sides are delimited;
- the alias is missing or malformed;
- the bare token is outside the safe identifier grammar;
- the authoritative symbol selection does not correspond to either parsed display token;
- more than one authoritative declaration maps to the same identifier.

### Safe identifier grammar

The first slice accepts a bounded Unicode identifier with:

- first code point: Unicode letter or `_`;
- subsequent code points: Unicode letters, Unicode decimal digits, `_`, `.`, `$`, or `-`;
- maximum UTF-8 length: the existing `maxSymbolNameBytes` limit.

The scanner operates in UTF-16 source coordinates while validating UTF-8 byte limits. Unsupported punctuation-heavy PlantUML names require an explicit future design rather than broad token guessing.

## 5. Reference positions

The new engine may resolve an exact known identifier token in these bounded contexts:

- the identifier token on its own declaration line;
- relation and sequence-message endpoints before an optional message/relation label;
- the owner token before class/member shorthand such as `OrderService : submit()`;
- another structural source position before a relation-label boundary, provided the token is outside comments, quotes, directives, and preprocessor input.

The engine returns `null` for:

- message or relation label text after the structural label separator;
- comments and block comments;
- quoted narrative text;
- directives beginning with `@` or `!`;
- implicit participants not backed by an authoritative explicit declaration;
- malformed or ambiguous declarations;
- duplicate identifiers;
- cursor positions on whitespace, delimiters, or partial tokens;
- unsupported identifiers.

## 6. LSP contract

### Initialize

A client enables the feature with a valid plain `textDocument.definition` capability. Only then does the server advertise:

```json
{
  "definitionProvider": true
}
```

Absent, malformed, array-valued, proxied, revoked, or throwing capability records disable the feature. A request in a session that did not negotiate the capability returns fixed `method_not_found`.

### Request

The server accepts standard `textDocument/definition` params:

```json
{
  "textDocument": {
    "uri": "file:///workspace/model.puml"
  },
  "position": {
    "line": 8,
    "character": 5
  }
}
```

The URI and UTF-16 position use the existing normalized local-document contracts. Invalid shapes map to stable source-free errors.

### Result

A unique target returns one deeply frozen same-document `Location`:

```json
{
  "uri": "file:///workspace/model.puml",
  "range": {
    "start": { "line": 2, "character": 9 },
    "end": { "line": 2, "character": 21 }
  }
}
```

The range is the exact authoritative declaration `selectionRange`, not the whole declaration line. A valid request without a proven unique target returns JSON `null`.

The first slice deliberately returns `Location`, even if a client advertises `linkSupport`. `LocationLink` and origin-selection behavior require a separate UI and protocol design.

## 7. Architecture

```text
base diagnostic session
  → document-symbol session
  → completion session
  → folding session
  → hover session
  → definition session
```

### `definitions.js`

Pure transport-neutral engine:

- validates the complete source, URI, and UTF-16 position;
- obtains the authoritative symbol tree through `documentSymbolsForSource`;
- flattens the bounded hierarchy iteratively;
- derives conservative declaration identifiers from authoritative declaration lines;
- records duplicate identifiers as ambiguous;
- masks comments and quoted text without shifting UTF-16 offsets;
- scans the requested line only after the identifier table is built;
- returns one immutable `Location` or `null`.

### `definition-session.js`

Outer session adapter:

- capability negotiation and `definitionProvider` advertisement;
- latest accepted snapshot ownership;
- mutation epoch/sequence ordering matching completion, folding, hover, and symbols;
- lifecycle invalidation;
- hostile boundary normalization;
- delegation of all existing methods and notifications to the hover session.

### Public entrypoint

`createLanguageServerSession` composes the definition layer over hover. The package exports the pure definition engine and the direct definition-session factory for testing and modular host reuse.

## 8. Snapshot and concurrency rules

Only a document mutation accepted by the complete inner session becomes visible to definitions.

The outer layer must preserve these invariants:

- a rejected open or change cannot replace a valid definition snapshot;
- a rejected newer mutation does not permanently suppress an earlier pending valid mutation;
- a newer accepted change supersedes an older renderer completion;
- a close completed during validation prevents snapshot resurrection;
- shutdown, exit, and disposal clear all source state;
- no definition request can observe partially accepted source.

The implementation follows the proven epoch and per-document mutation-sequence pattern used by completion, symbols, folding, and hover rather than introducing shared mutable state.

## 9. Privacy and security boundary

The feature:

- does not dereference the URI;
- does not read files;
- does not invoke PlantUML;
- does not call an LLM;
- does not evaluate includes, macros, or preprocessors;
- does not inspect the workspace;
- does not start a shell;
- does not use the network;
- does not echo source, URI values, identifiers, aliases, or host exceptions in public errors;
- fails by omission when syntax or identity is ambiguous.

All dynamic public output is limited to a previously validated local URI and an authoritative frozen source range.

## 10. Testing strategy

### Pure engine

- bare declaration identifiers;
- both supported `as` orientations;
- class, interface, participant, actor, component, use case, state, and deployment declarations;
- declaration self-navigation;
- relation/message endpoints;
- member-owner shorthand;
- nested package/namespace declarations;
- multilingual display labels and Unicode identifiers;
- LF, CRLF, and CR;
- exact inclusive-start/exclusive-end UTF-16 positions;
- comments, block comments, strings, directives, labels, implicit participants, malformed declarations, unsupported alias shapes, duplicate identifiers, and no-match positions;
- maximum source, identifier, and hierarchy bounds;
- hostile position records and source validation.

### Session

- capability advertisement and omission;
- malformed, proxied, revoked, and throwing capabilities;
- malformed params and remote URIs;
- lifecycle before initialization and after shutdown/exit/disposal;
- latest accepted source;
- rejected mutations;
- out-of-order renderer completions;
- close-during-validation;
- direct hostile mutation boundaries.

### Integration

- real bounded Content-Length stdio initialize/open/definition/shutdown/exit flow;
- fixed method-not-found when definition was not negotiated;
- JSON-RPC invalid-params mapping;
- exact package-content and repository documentation contracts.

Every production line, branch, and function and every production module/public symbol JSDoc must reach 100%. No skipped, ignored, todo, or expected-failure tests are permitted.

## 11. Documentation and standards record

Update:

- root and package READMEs;
- product PRD FR-012 status;
- architecture and security model;
- product and operations guides;
- APA 7th research note citing LSP 3.18 and official PlantUML class, sequence, component, and use-case documentation;
- `CHANGELOG.md` under `Unreleased`;
- package and repository contract tests.

## 12. Product Design boundary

This PR adds a standard editor-protocol capability and no custom Studio visual component. Figma is not required. Product Design and Figma are mandatory before implementing a definition peek panel, breadcrumb/history visualization, custom focus treatment, or reference graph.

## 13. Release decision

No version bump or release is proposed. Packages remain `0.0.0` under `Unreleased`. A release still requires Studio integration, cross-platform real-runtime evidence, packaging, signing, provenance/SBOM, rollback, support, and complete release governance.
