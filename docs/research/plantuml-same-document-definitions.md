# Conservative same-document PlantUML definitions

## Research question

How can DiagramWeave provide standard Go to Definition for explicit PlantUML declarations without inventing workspace semantics, dereferencing files, evaluating includes or macros, calling a renderer or LLM, or creating a second declaration parser?

## Decision

Implement Language Server Protocol 3.18 `textDocument/definition` as a bounded identity layer over the existing authoritative document-symbol tree.

The server advertises `definitionProvider: true` only when the client supplies a plain `capabilities.textDocument.definition` record. A valid request returns exactly one deeply frozen same-document `Location` or `null`. The target range is the existing `DocumentSymbol.selectionRange`; the definition feature never manufactures a competing declaration range.

## Protocol contract

LSP 3.18 defines `textDocument/definition` with `DefinitionParams` and a result of `Definition | DefinitionLink[] | null`. DiagramWeave deliberately implements the narrowest interoperable result: one `Location` or `null`.

Positions are zero-based UTF-16 code-unit offsets because the server advertises UTF-16. Starts are inclusive and ends are exclusive. A malformed or out-of-document position maps to the stable source-free `document_position_invalid` error and JSON-RPC invalid params. A valid position without unique evidence returns `null`.

## Authoritative identity source

`documentSymbolsForSource` already proves explicit declarations, displayed labels, source-order hierarchy, exact selection ranges, and bounded symbol counts. Definition flattens that immutable tree iteratively and derives only a conservative reference identifier from each proven declaration line.

The symbol scanner and definition layer share the declaration-family, delimiter, and display-label contract. The inner identifier derivation therefore relies on the scanner's invariants instead of repeating unreachable defensive branches. This keeps the document-symbol tree as the sole declaration source of truth while preserving exact 100% executable coverage.

## Supported identifiers

The first slice supports:

- a safe bare declaration such as `class Gateway`;
- a delimited display label followed by one safe bare alias, such as `class "Order Service" as OrderService`;
- one safe bare identifier followed by a delimited display label, such as `participant UserActor as "User"`;
- exact declaration display and alias tokens;
- exact relation endpoints in bounded structural lines;
- member-owner shorthand before `:`.

Quoted, parenthesized, bracketed, and colon-delimited display labels remain presentation data. Only the safe bare side of a supported declaration can become a reusable reference identifier.

## Fail-by-omission rules

The resolver returns `null` rather than guessing when it encounters:

- duplicate identifiers;
- missing, malformed, delimited-only, unsafe, or oversized aliases;
- implicit declarations;
- comments or block-comment content;
- quoted narrative;
- directives and preprocessor lines;
- relation labels after `:`;
- unknown identifiers;
- non-structural prose;
- cross-document, include, macro, or renderer-dependent identity.

This behavior is essential because PlantUML can create implicit participants and can transform source through includes and macros. Same-document definition must not claim an identity it cannot prove locally.

## Structural-context boundary

The source line is masked without changing UTF-16 offsets. Line comments, block comments, and quoted narrative become spaces. Directives beginning with `@` or `!` are non-navigable. For relations, only the segment before the label separator is inspected. The accepted relation operators are explicitly bounded rather than inferred from arbitrary punctuation.

Identifier tokenization uses Unicode letters and numbers with `_`, `.`, `$`, and `-` after the first character. Visually confusable scripts are not normalized or merged. Equality is exact and case-sensitive, matching explicit source identity rather than display similarity.

## Snapshot and concurrency model

The definition session composes over hover, folding, completion, document symbols, and diagnostics. It owns only the latest source snapshot accepted by every inner layer.

Per-document mutation sequences and a session epoch ensure that:

- a rejected newer open or change cannot replace valid evidence;
- a newer accepted change supersedes an older renderer completion;
- an older mutation cannot publish while newer work is active;
- close, shutdown, exit, and disposal prevent source resurrection.

No caller-owned request or capability object is retained. Accepted scalar values are copied into frozen records, and hostile getters, proxies, revoked proxies, arrays, and malformed records fail closed with fixed errors.

## Privacy and security

Definition performs no file read, URI dereference, renderer invocation, LLM request, shell execution, include expansion, macro evaluation, workspace scan, or network access. Local `file:` URIs are identifiers only. Results contain a validated URI and authoritative range, never source excerpts, renderer paths, stderr, credentials, or dynamic host errors.

## Verification requirements

Merge evidence must include:

- bare and both alias orientations;
- all supported display delimiters;
- escaped and doubled quotes;
- malformed and oversized aliases;
- duplicate identifiers;
- comments, directives, labels, and quoted narrative;
- every bounded relation operator;
- declaration and reference positions;
- inclusive starts and exclusive ends;
- LF, CRLF, and CR;
- multilingual and supplementary-plane UTF-16 ranges;
- nested symbol trees without recursive traversal;
- hostile capability and parameter objects;
- rejected and concurrent mutation races;
- real bounded stdio JSON-RPC behavior;
- exact package contents;
- production line, branch, and function coverage at 100%;
- public JSDoc coverage at 100%.

## Limitations

This slice does not provide cross-document definition, references, rename, workspace indexing, include resolution, macro evaluation, scope shadowing, member identity, or renderer-derived semantics. Those capabilities require separate bounded designs and should not silently expand this contract.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol specification, version 3.18*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (2026). *Class diagram syntax and features*. https://plantuml.com/class-diagram

PlantUML. (2026). *Component diagram syntax and features*. https://plantuml.com/component-diagram

PlantUML. (2026). *Sequence diagram syntax and features*. https://plantuml.com/sequence-diagram

JSON-RPC Working Group. (2013). *JSON-RPC 2.0 specification*. https://www.jsonrpc.org/specification
