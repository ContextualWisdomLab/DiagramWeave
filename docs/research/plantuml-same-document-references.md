# Conservative same-document PlantUML references

## Research question

How can DiagramWeave provide standard Find All References for explicit PlantUML identifiers without claiming workspace, include, macro, renderer, or index semantics that the current Language Server does not own?

## Decision

Implement Language Server Protocol 3.18 `textDocument/references` as a bounded same-document navigation capability over the latest accepted synchronized source snapshot.

The server advertises `referencesProvider: true` only when the client supplies a valid plain `capabilities.textDocument.references` record. A request must contain a valid local document URI, a UTF-16 position, and a boolean `context.includeDeclaration`. The result is a deeply frozen source-order `Location[]`. A valid request without one uniquely proven identity returns the shared frozen empty collection. Results are bounded to 4,096 locations; overflow fails closed with the fixed source-free `reference_limit_exceeded` error rather than truncating evidence.

The implementation composes over the existing Go to Definition and document-symbol layers. It does not create a second declaration parser or a second identity authority.

## Protocol contract

Language Server Protocol 3.18 defines `textDocument/references` using `ReferenceParams`, which combines a text-document position with `ReferenceContext`. `ReferenceContext.includeDeclaration` tells the server whether the declaration itself should be included in the returned reference set. The server capability is `referencesProvider`, and the protocol result is `Location[] | null`, with optional partial-result support for implementations that need streaming.

DiagramWeave deliberately implements a narrower, deterministic subset:

- same-document references only;
- no partial-result streaming in this slice;
- source-order `Location[]` rather than workspace-dependent ordering;
- `includeDeclaration: true` includes the authoritative declaration selection range exactly once;
- `includeDeclaration: false` excludes that declaration;
- ambiguous or unsupported identity fails by omission instead of approximation.

This remains interoperable with standard LSP clients while making the implementation boundary explicit.

## Why the first slice is same-document only

The current DiagramWeave Language Server owns synchronized in-memory document text. It does not yet own a workspace index, include graph, file-watcher lifecycle, cross-document cache invalidation, symlink policy, path-authorization model, or cancellation semantics for repository-wide search.

Claiming workspace-wide references without those controls would create false evidence and hidden coupling. A safe cross-document implementation requires a separate bounded design for indexing, file ownership, include resolution, cancellation, authorization, invalidation, persistence, and rollback. Until that exists, `textDocument/references` is explicitly limited to the accepted source snapshot already held by the session.

## Authoritative identity source

`documentSymbolsForSource` remains the authoritative source of explicit declaration existence, hierarchy, display labels, and exact declaration ranges. The navigation implementation reuses the conservative identifier grammar already used by Go to Definition in `definitions.js`.

This produces one identity model for both navigation directions:

1. the document-symbol tree proves a declaration;
2. the shared definition/reference grammar derives only a conservative reusable identifier from that declaration;
3. cursor resolution proves which identifier, if any, is selected;
4. reference collection finds only structurally valid exact occurrences of that identifier.

A duplicate identifier invalidates uniqueness. The resolver does not select one declaration by source proximity, display similarity, or heuristic ranking.

## PlantUML identity evidence

PlantUML's official syntax documents repeatedly distinguish display text from reusable aliases. Class diagrams allow a declaration to receive an alias with `as`, after which later references use the alias. Component and use-case syntax use the same alias pattern for later relations. Sequence diagrams likewise declare participants with aliases that are then used in messages.

That makes explicit aliases useful navigation evidence, but PlantUML's flexible syntax also makes unconstrained text search unsafe. Comments, relation labels, quoted narrative, directives, implicit participants, preprocessing, and presentation text can contain the same characters without representing the same declaration identity. DiagramWeave therefore treats alias and bare-identifier evidence structurally and fails by omission when the local source cannot prove identity.

## Supported identifier and occurrence rules

A declaration contributes a navigable identifier only when it matches one of the existing conservative definition forms:

- a safe bare declaration token, such as `class Gateway`;
- a delimited display label followed by a safe bare alias, such as `class "Order Service" as OrderService`;
- a safe bare alias followed by a delimited display label, such as `participant UserActor as "User"`.

A cursor can establish the identity through the authoritative declaration selection range, the supported alias token on the declaration line, a structurally valid relation or sequence endpoint, or the member-owner shorthand before `:`.

Identifier equality is exact and case-sensitive. The navigation layer does not normalize visually similar Unicode scripts or reinterpret presentation labels as identities.

## `includeDeclaration` semantics

The declaration location comes only from the authoritative symbol `selectionRange`.

When `includeDeclaration` is `true`, that range is included exactly once in the source-ordered result. When it is `false`, the declaration is omitted and only proven uses remain. A use that happens to share text with the declaration but is outside an accepted structural context is not promoted into the result.

The implementation deduplicates locations by exact source range. It does not fabricate extra locations to satisfy a requested count or silently merge ambiguous declarations.

## Structural fail-by-omission boundary

Reference collection excludes:

- line comments and block comments;
- quoted narrative and display labels;
- directives beginning with `@` or `!`;
- relation and message labels after `:`;
- malformed declarations and malformed alias forms;
- implicit participants or other identities not proven by the declaration tree;
- duplicate declaration identifiers;
- includes, macros, preprocessors, and renderer-dependent semantics;
- unsupported punctuation-heavy identifiers;
- cross-document or workspace-only evidence.

Source masking preserves UTF-16 offsets by replacing excluded content with position-preserving spaces. Structural inspection is therefore conservative without shifting the ranges returned to the client.

## Boundedness and ordering

The feature inherits the Language Server's existing document-size, symbol-count, and symbol-name limits. It adds a fixed maximum of 4,096 returned reference locations.

The 4,096 boundary is inclusive. Producing a 4,097th location raises `reference_limit_exceeded`; the server never returns a silently truncated list because truncation would make refactoring and blast-radius decisions unsound.

Traversal of the authoritative symbol hierarchy is iterative rather than recursive. Results are sorted by start line and start character. Every emitted identifier range is single-line and uses the server's advertised UTF-16 position encoding.

## Snapshot and concurrency model

The reference session exposes only source text accepted by the complete inner Language Server composition.

Per-document mutation sequencing and a session epoch enforce these invariants:

- a rejected open or change cannot replace an accepted snapshot;
- an older mutation cannot publish while newer work remains active;
- a newer accepted change supersedes an older renderer completion;
- close during validation prevents a pending mutation from resurrecting reference state;
- shutdown, exit, and disposal invalidate reference state;
- a request never observes a partially accepted source mutation.

Reference output therefore corresponds to one complete accepted source snapshot, not to a mixture of asynchronous validation states.

## Privacy and security boundary

The document URI is an identifier only and is never dereferenced by this capability.

Reference lookup performs no file read, directory traversal, workspace scan, PlantUML renderer invocation, LLM request, shell execution, include expansion, macro evaluation, or network access. It returns only a validated local URI and bounded source ranges. Errors do not return source text, identifier strings, aliases, renderer output, credentials, paths derived from source content, or dynamic host exceptions.

This boundary preserves offline operation and evidence minimization while avoiding the misleading appearance of workspace authority that the implementation does not yet possess.

## Verification requirements

Exact-head acceptance must include realistic regression evidence for:

- bare declarations and both supported alias orientations;
- declaration, alias, relation endpoint, sequence endpoint, and member-owner cursor positions;
- `includeDeclaration` both `true` and `false`;
- repeated references, self references, and references that occur before their declaration;
- multiple references on one line with deterministic source ordering;
- LF, CRLF, and CR snapshots;
- multilingual identifiers and supplementary-plane UTF-16 positions;
- comments, block comments, quoted narrative, directives, relation labels, implicit participants, malformed aliases, unsupported tokens, duplicates, and valid no-match positions;
- hostile, revoked, malformed, or throwing capability and parameter records;
- the exact 4,096-location boundary and overflow failure;
- the maximum supported symbol hierarchy without recursive traversal;
- accepted, rejected, concurrent, stale, closed, shutdown, exited, and disposed mutation states;
- real bounded stdio framing for `textDocument/references`;
- exact package contents and independently reusable embedded-session behavior.

Production statement/line, branch, and function coverage must remain exactly 100%, and public JSDoc coverage must remain 100%. No skipped reference test is accepted as passing evidence.

## Limitations and future work

This slice does not provide workspace-wide references, include resolution, macro expansion, cross-file rename, workspace indexing, streaming partial results, semantic member identity, renderer-derived identity, or visual reference exploration.

Those capabilities require separate designs with explicit ownership, authorization, invalidation, cancellation, packaging, and rollback contracts. A future Studio references panel, grouped previews, keyboard focus and return navigation, multi-file grouping, visual reference graph, or rename preview also requires Product Design and Figma work before implementation.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol specification, version 3.18*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (2026). *Class diagram syntax and features*. https://plantuml.com/class-diagram

PlantUML. (2026). *Component diagram syntax and features*. https://plantuml.com/component-diagram

PlantUML. (2026). *Sequence diagram syntax and features*. https://plantuml.com/sequence-diagram

PlantUML. (2026). *Use case diagram syntax and features*. https://plantuml.com/use-case-diagram
