# Document-symbol compatibility product slice

## Buyer problem

DiagramWeave Studio and current IDE clients can consume hierarchical LSP document
symbols, but older editors and lightweight LSP adapters may support only the
flat `SymbolInformation[]` response. Returning a tree to every client makes the
same Language Server appear functional in one host and unusable in another.

A buyer embedding DiagramWeave in naruon, an existing IDE estate, or an internal
document platform should not need to fork the Language Server or rebuild a
PlantUML parser merely to display an outline.

## Product outcome

The server now negotiates one of two views during initialize:

- `hierarchicalDocumentSymbolSupport: true` returns the existing source-order
  `DocumentSymbol[]` tree with proven children;
- absent, false, malformed, or hostile capability input returns source-order
  `SymbolInformation[]` with an immediate `containerName` when ownership was
  proven.

Both views come from the same authoritative scanner and therefore preserve the
same names, kinds, enclosing ranges, UTF-16 coordinates, limits, malformed-source
policy, privacy boundary, and latest accepted source snapshot.

## Users and jobs

### Enterprise IDE administrator

Deploy one DiagramWeave Language Server across a mixed editor fleet without
maintaining client-specific forks.

### Developer and architect

Open the same PlantUML file in a modern or older editor and receive a usable,
deterministic outline rather than no navigation at all.

### Platform integrator

Embed the transport-neutral package in Studio, IDE extensions, `dweave-lsp`,
naruon, and other CWL hosts while relying on standard LSP capability negotiation.

### Security and operations owner

Know that compatibility conversion introduces no source read, remote fetch,
renderer call, LLM call, hidden persistence, or dynamic error leakage.

## Functional requirements

| ID | Requirement |
|---|---|
| DSC-001 | Advertise `documentSymbolProvider: true` to initialized clients. |
| DSC-002 | Return hierarchy only for exact boolean `hierarchicalDocumentSymbolSupport: true`. |
| DSC-003 | Return flat `SymbolInformation[]` for all other capability states. |
| DSC-004 | Preserve source pre-order across roots and descendants. |
| DSC-005 | Preserve symbol name, kind, local URI, and enclosing range. |
| DSC-006 | Set `containerName` to the immediate proven parent and omit it for roots. |
| DSC-007 | Build flat output iteratively without recursive product traversal. |
| DSC-008 | Deeply freeze every public result and newly owned record. |
| DSC-009 | Preserve lifecycle, concurrency, limits, diagnostics, completion, and stdio behavior. |
| DSC-010 | Fail closed for malformed and hostile capability objects. |

## Acceptance criteria

- Modern and legacy response shapes pass direct session and real stdio tests.
- A 512-level fixture is flattened without recursion failure.
- Missing, false, array-valued, incomplete, and throwing capability paths all
  select the flat result.
- The compatibility adapter never invents ownership; it uses only proven tree
  parentage.
- Existing renderer, diagnostics, outline, completion, transport, package, and
  repository tests remain green.
- Production statement, branch, and function coverage remains 100%.
- Production JSDoc coverage remains 100%.
- Node.js 22 and 24, package dry runs, SAST, Security Scan, CodeRabbit, and review
  gates pass on the exact merge head.

## Accessibility

A flat outline remains available to clients that cannot render an accessible
hierarchical tree. DiagramWeave does not encode depth through color or visual
indentation in the protocol; `containerName` is explicit text data that clients
can expose to assistive technology.

## Product Design and Figma boundary

This change is a protocol compatibility slice and does not require a new Figma
artifact. DiagramWeave Studio must continue to advertise hierarchical support
and consume the tree. Future external-client setup guidance may be designed in
Figma only if a user-facing configuration screen is added.

## Non-goals

- workspace-wide symbol indexing;
- hover, definition, references, rename, or semantic tokens;
- a second PlantUML scanner;
- a Studio outline redesign;
- database persistence;
- release or version change while the product remains an unreleased foundation.

## Success signal

The same server package returns a valid outline to both capability classes with
no host-specific parsing code, no divergent symbol semantics, and no additional
trust boundary.
