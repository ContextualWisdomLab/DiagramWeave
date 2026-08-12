# Same-document Find All References

## Buyer-visible problem

DiagramWeave already provides diagnostics, document outline, declaration completion, folding, hover, and Go to Definition. Without Find All References, users still have to search manually to understand where a proven PlantUML identifier is used before changing or removing it. Plain text search is not trustworthy for this job because comments, display labels, directives, quoted narrative, relation labels, malformed aliases, and unrelated presentation text can contain the same characters without representing the same declaration identity.

## Product outcome

DiagramWeave provides standard Language Server Protocol 3.18 `textDocument/references` for uniquely proven identifiers inside the currently open PlantUML document.

Clients that advertise a valid plain `textDocument.references` capability receive `referencesProvider: true`; clients that omit or provide a malformed capability receive no references provider. Every request must provide a boolean `context.includeDeclaration`.

A successful action returns a deeply frozen source-order `Location[]` tied to the latest accepted source snapshot. With `includeDeclaration: true`, the authoritative declaration selection range appears exactly once. With `includeDeclaration: false`, only proven uses are returned. A valid but ambiguous or unsupported action returns an empty collection; the product never promotes a text match into semantic evidence.

The result is bounded to 4,096 locations. If a document would produce a 4,097th location, DiagramWeave returns the stable source-free `reference_limit_exceeded` error instead of silently truncating evidence.

## Supported user journeys

### Alias blast-radius inspection

```plantuml
class "Order Service" as OrderService
actor Customer
Customer --> OrderService : submits
OrderService --> Database : persists
```

Invoking Find All References on `OrderService` returns the structurally proven relation endpoints in source order. When `includeDeclaration` is true, the declaration selection range is included exactly once as well.

### Bare identifier references

```plantuml
class Gateway
class Database
Gateway --> Database
Gateway --> Database : retry
```

Invoking Find All References on `Database` returns both relation endpoints. The relation label `retry` is presentation text and is never interpreted as an identifier.

### Reference before declaration

```plantuml
Client --> Gateway
class Gateway
```

The result remains source ordered even when a proven use occurs before its declaration. The feature does not assume declarations must precede references in source order.

## Trust boundary

The feature is intentionally conservative:

- declaration existence and declaration ranges come only from the authoritative document-symbol tree;
- reference identity reuses the same conservative identifier grammar as Go to Definition;
- identifier equality is exact and case-sensitive;
- duplicate identifiers are ambiguous and produce no reference set;
- comments, block comments, quoted narrative, display labels, directives, relation or message labels, malformed aliases, and implicit declarations never become evidence;
- includes, macros, preprocessors, renderer-derived identities, and unsupported punctuation-heavy forms are omitted;
- the document URI is an identifier only and is never dereferenced;
- no LLM, renderer, filesystem, workspace scan, shell, include expansion, macro evaluation, or network request occurs;
- cross-document and workspace-wide references are explicitly outside this slice.

This boundary is a product advantage for regulated, offline, and high-assurance environments because basic navigation remains deterministic and does not depend on model availability, external services, renderer configuration, or hidden repository access.

## Host integration

The same transport-neutral session is reusable by:

- DiagramWeave Studio;
- `dweave-lsp` over the bounded stdio JSON-RPC transport;
- IDE extensions;
- naruon;
- other CWL products that host PlantUML source.

Clients must negotiate the standard references capability. Hosts own file access, editor focus, result presentation, navigation history, and any workspace-level authorization that may be introduced in a future separate slice.

## Accessibility

Find All References must be reachable through the host's keyboard command, command palette, context menu, and assistive-technology semantics. It must not require pointer hover, color recognition, or precise mouse positioning. A host that presents multiple locations must expose source order and count through accessible text, not color or spatial position alone.

This backend protocol slice introduces no custom Studio surface, so no Figma artifact is required. Product Design and Figma are mandatory before adding a references panel, grouped previews, keyboard focus and return navigation, multi-file grouping, custom result visualization, or a visual reference graph.

## Correctness and safety semantics

The reference set corresponds to one complete accepted source snapshot. Rejected mutations preserve the previous accepted snapshot; newer accepted work supersedes older asynchronous completion; close, shutdown, exit, and disposal invalidate reference evidence; and a late completion cannot resurrect a closed or superseded document.

The implementation fails by omission rather than approximation. An empty collection is therefore a meaningful conservative result, not proof that arbitrary textual matches do not exist.

No result may be silently truncated. The 4,096-location ceiling is inclusive and intentionally fail-closed because incomplete reference evidence would be unsafe input to future rename, refactoring, migration, or blast-radius workflows.

## Success criteria

The slice is complete only when:

- bare declarations and both supported alias orientations resolve consistently with Go to Definition;
- `includeDeclaration` is mandatory and honored exactly;
- declaration, alias, relation endpoint, sequence endpoint, and supported member-owner positions produce the expected source-order locations;
- comments, block comments, quoted narrative, directives, relation labels, implicit declarations, malformed aliases, unsupported identities, and duplicates fail by omission;
- returned ranges are exact UTF-16 ranges across LF, CRLF, CR, emoji, and multilingual source;
- 4,096 locations succeed and overflow fails without truncation;
- rejected, stale, concurrent, closed, shutdown, exited, and disposed mutations cannot corrupt the accepted snapshot;
- embedded hosts and real bounded stdio return equivalent `textDocument/references` semantics;
- existing diagnostics, symbols, completion, folding, hover, and definition behavior remains unchanged;
- production statement/line, branch, and function coverage is exactly 100%;
- public JSDoc coverage is 100%;
- no skipped reference test is accepted as evidence;
- package dry runs include the reference engine and session;
- research, operations, architecture, PRD, changelog, and package records are current.

## Deferred buyer gaps

The next navigation and refactoring increments are deliberately separate:

1. safe same-document rename with preview, collision detection, and explicit acceptance;
2. workspace indexing with file ownership, authorization, cancellation, invalidation, and symlink policy;
3. include-aware navigation with provenance and cycle limits;
4. workspace-wide references with bounded streaming or pagination semantics;
5. Studio references and rename UX after Product Design and Figma validation.

The product must not silently expand from a deterministic same-document evidence contract into workspace authority or source mutation semantics within this slice.

## Release status

This capability remains part of the unreleased `0.0.0` foundation. It is not independently sufficient for a commercial release. Studio integration, cross-platform packaging, signing, provenance, SBOM, rollback rehearsal, support policy, accessibility validation, and end-to-end user evidence remain release prerequisites.
