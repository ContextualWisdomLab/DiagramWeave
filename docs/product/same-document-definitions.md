# Same-document Go to Definition

## Buyer-visible problem

DiagramWeave already provides diagnostics, document outline, declaration completion, folding, and declaration hover. Without Go to Definition, users must still search manually from a relation endpoint or alias to the explicit declaration that owns its meaning. This becomes costly in architecture diagrams with repeated packages, long relation blocks, or descriptive display labels.

## Product outcome

DiagramWeave provides standard LSP 3.18 `textDocument/definition` for uniquely proven identifiers inside the currently open PlantUML document.

A successful action moves the editor to the authoritative declaration label. A valid but ambiguous or unsupported action does nothing and returns `null`; the product never selects an arbitrary target.

## Supported user journeys

### Alias reference to declaration

```plantuml
class "Order Service" as OrderService
actor Customer
Customer --> OrderService : submits
```

Invoking Go to Definition on `OrderService` navigates to `Order Service` in the explicit declaration.

### Bare declaration reference

```plantuml
class Gateway
class Database
Gateway --> Database
```

Invoking Go to Definition on either relation endpoint navigates to the exact declaration selection range.

### Declaration-local navigation

Invoking the command on an explicit declaration's displayed label or supported bare alias returns that declaration. This keeps host behavior deterministic even when the command is issued from a symbol or outline integration.

## Trust boundary

The feature is intentionally conservative:

- target existence and ranges come only from the authoritative document-symbol tree;
- identifier equality is exact and case-sensitive;
- duplicate identifiers are ambiguous and return `null`;
- comments, quoted narrative, directives, relation labels, malformed aliases, and implicit declarations never become targets;
- URIs are identifiers only and are never dereferenced;
- no LLM, renderer, filesystem, include, macro, workspace, shell, or network work occurs.

This boundary is a product advantage for regulated and offline environments because basic editor navigation does not depend on model availability, external services, or renderer configuration.

## Host integration

The same transport-neutral session is reusable by:

- DiagramWeave Studio;
- `dweave-lsp` over bounded stdio JSON-RPC;
- IDE extensions;
- naruon;
- other CWL products that host PlantUML source.

Clients must negotiate the standard definition capability. Hosts own file access, editor focus, navigation history, and user-visible failure presentation.

## Accessibility

Go to Definition must be reachable through the host's keyboard command, command palette, context menu, and assistive-technology semantics. It must not require pointer hover, color recognition, or precise mouse positioning.

This backend protocol slice introduces no custom Studio surface, so no Figma artifact is required. Product Design and Figma are mandatory before adding a definition peek panel, breadcrumb, navigation history, reference graph, custom focus treatment, or multi-target chooser.

## Success criteria

The slice is complete only when:

- relation endpoints and both supported alias orientations navigate correctly;
- returned ranges are exact UTF-16 ranges across newline conventions and multilingual source;
- duplicate and unsupported identities fail by omission;
- rejected or stale document mutations cannot change the target snapshot;
- stdio and embedded hosts return the same result;
- existing diagnostics, symbols, completion, folding, and hover behavior remains unchanged;
- production line, branch, and function coverage is 100%;
- public JSDoc coverage is 100%;
- package dry runs include the definition engine and session;
- research, operations, architecture, PRD, and changelog records are current.

## Deferred buyer gaps

The next navigation increments are deliberately separate:

1. same-document references with bounded source-order locations;
2. safe same-document rename with preview and collision checks;
3. workspace indexing with explicit file ownership and cancellation;
4. include-aware navigation with provenance and cycle limits;
5. Studio peek and navigation-history UX after Figma validation.

The product should not silently expand from a deterministic one-location contract into workspace or mutation semantics within this slice.

## Release status

This capability remains part of the unreleased `0.0.0` foundation. It is not independently sufficient for a commercial release. Studio integration, cross-platform packaging, signing, provenance, SBOM, rollback rehearsal, support policy, and end-to-end user evidence remain release prerequisites.
