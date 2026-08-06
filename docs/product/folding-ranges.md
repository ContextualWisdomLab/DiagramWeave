# Conservative folding ranges product slice

## Buyer problem

A large PlantUML architecture source may contain hundreds of declarations inside
nested packages and namespaces. DiagramWeave already proves that structure for
outlines, but users still have to view and scroll every line because editors
cannot request folding information from the Language Server.

This creates avoidable cognitive load for architects, reviewers, technical PMs,
and documentation teams. It also forces each Studio or IDE host to invent local
brace logic that can disagree on malformed or ambiguous source.

## Product outcome

A client that negotiates the LSP 3.18 `textDocument.foldingRange` capability can
request `textDocument/foldingRange` and receive deterministic, source-order
package and namespace folds from the same authoritative scanner used by document
outlines.

```text
package Platform {          visible declaration line
  namespace api {           collapsible nested body
    class Gateway
  }
  class Worker
}
```

The client can collapse the body while preserving the declaration. No model,
renderer, workspace index, or network connection is required.

## Users and jobs

### Software and solution architect

Collapse stable subsystems while reviewing one active package, reducing visual
noise in large architecture diagrams.

### Platform and infrastructure engineer

Navigate deployment and component sources without losing the authoritative
text, Git diff, or offline workflow.

### Technical PM and business analyst

Use an IDE or DiagramWeave Studio with a manageable source view despite limited
PlantUML syntax expertise.

### Developer-experience owner

Provide one consistent folding contract to Studio, IDE extensions,
`dweave-lsp`, naruon, and other CWL hosts without maintaining host-specific
parsers.

### Enterprise security administrator

Retain local source, renderer isolation, no remote include evaluation, and no
hidden model or network dependency for editor navigation.

## Functional requirements

| ID | Requirement |
|---|---|
| FOLD-001 | Advertise `foldingRangeProvider: true` only for a valid plain `textDocument.foldingRange` client capability. |
| FOLD-002 | Return `method_not_found` when folding was not negotiated. |
| FOLD-003 | Derive ranges only from complete package and namespace scopes proven by the authoritative symbol scanner. |
| FOLD-004 | Preserve source preorder across parents, descendants, and siblings. |
| FOLD-005 | Return zero-based `startLine` and `endLine` only. |
| FOLD-006 | Keep the declaration line visible when a client collapses a body. |
| FOLD-007 | Omit empty two-line and balanced one-line scopes. |
| FOLD-008 | Honor valid client `rangeLimit` values as a deterministic prefix capped at 1,024. |
| FOLD-009 | Produce identical output for line-only and character-aware clients. |
| FOLD-010 | Walk deep trees iteratively without recursive product traversal. |
| FOLD-011 | Deeply freeze every public range and result array. |
| FOLD-012 | Preserve accepted-snapshot, lifecycle, stale-mutation, diagnostics, symbols, completion, and stdio behavior. |
| FOLD-013 | Fail closed for malformed and hostile capabilities and request records. |
| FOLD-014 | Perform no LLM, renderer, file, include, macro, shell, workspace, or network work. |

## Structural behavior

A fold is available only when all of the following are true:

1. the declaration is a package or namespace;
2. the existing scanner proves one unmatched unquoted opening brace;
3. a later standalone closing brace has matching indentation and stack order;
4. at least one source line exists between opener and closer;
5. the client result limit has not been reached.

DiagramWeave deliberately does not fold structural-looking syntax in quotes,
comments, class members, relations, directives, macros, includes, malformed
blocks, or renderer-dependent source.

## Accessibility

Folding is an editor navigation enhancement, not a replacement for source
access. Clients retain the visible declaration line and the complete source
remains available through standard expand, keyboard, search, and outline flows.
The protocol does not encode state by color, hover, or animation.

A host should provide:

- keyboard commands for fold, unfold, fold all, and unfold all;
- an accessible name and expanded state for fold controls;
- focus preservation after collapse or expansion;
- source search that can reveal a match inside a folded range;
- a non-folding fallback when the client omits support.

## Client range preferences

The product honors a valid LSP unsigned `rangeLimit` exactly, capped by the
existing 1,024-symbol ceiling. A zero limit returns no folds. Invalid or hostile
options disable the provider rather than silently accepting an unsafe contract.

The selected prefix is deterministic source preorder. DiagramWeave does not
rank blocks by size, depth, popularity, or inferred importance.

## Security and privacy

- Source snapshots remain in memory and are never persisted by the Language
  Server.
- Document URIs are validated identifiers and are never dereferenced.
- Folding output contains only line numbers.
- No source excerpt, label, comment, raw renderer output, Java/JAR path,
  credential, rejected URI, or host exception is returned.
- The feature is offline and provider-neutral because it does not call a model.
- The feature does not weaken the renderer's `SANDBOX` or include policy.

## Quality and acceptance

- nested, sibling, empty, one-line, malformed, multilingual, newline, deep-tree,
  and range-limit fixtures pass;
- capability, request, lifecycle, race, and real stdio tests pass;
- existing diagnostics, document-symbol, legacy compatibility, completion,
  transport, package, and repository contracts stay green;
- production line, branch, and function coverage remains 100%;
- production JSDoc coverage remains 100%;
- no skipped, ignored, todo, or expected-failure test is accepted;
- Node.js 22 and 24, package dry runs, SAST, Security Scan, CodeRabbit, and review
  gates pass on one exact head.

## Product Design and Figma boundary

This backend slice exposes a standard LSP capability and does not add a
DiagramWeave Studio visual component, so it does not require a new Figma artifact.
Product Design and Figma become mandatory when Studio adds explicit
fold gutters, persistence, animations, command-palette states, minimap
indicators, or custom accessible interactions.

## Non-goals

- comment, import, or arbitrary region folding;
- folding of unproven class or component bodies;
- workspace-wide folding refresh;
- source mutation or formatting;
- a second PlantUML parser;
- Studio UI redesign;
- database persistence;
- release or version change while the product remains an unreleased foundation.

## Success signal

A modern editor, `dweave-lsp`, Studio, naruon, or another CWL host can collapse
the same proven grouping scopes without reparsing source, contacting a service,
or observing a different structure than the document outline.
