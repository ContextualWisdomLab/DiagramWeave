# Hierarchical PlantUML document outline

## Buyer-visible gap

DiagramWeave already gives manual authors a deterministic declaration outline,
but a flat list becomes difficult to navigate in large architecture sources.
Users cannot see which classes belong to a package or namespace, which sibling
is outside that scope, or how far an explicit declaration block extends.
Without a shared backend contract, Studio, IDE extensions, naruon, and other CWL
hosts would create inconsistent trees and malformed-source behavior.

This slice adds a conservative, reusable hierarchy to the existing LSP
`DocumentSymbol[]` result. It improves navigation without adding a parser,
renderer, LLM, account, network, file access, or hidden document store.

## User outcome

For complete explicit scopes, the outline presents source ownership directly:

```text
Platform
├── api
│   ├── Gateway
│   └── Port
└── Worker
External
```

Selecting a symbol still reveals its displayed label. Expanding a proven parent
shows declarations inside its complete matched brace interval. Root and sibling
order match source order.

## Included product contract

- optional LSP 3.18 `DocumentSymbol.children`;
- hierarchy for complete explicit declaration scopes from the existing
  high-signal PlantUML catalog;
- one unmatched unquoted opening brace on the declaration line;
- stack-ordered standalone closing brace with exactly matching indentation;
- enclosing parent ranges through the original closing line;
- unchanged UTF-16 label selections;
- quoted, escaped-quote, doubled-quote, line-comment, and block-comment brace
  suppression;
- conservative flat output for one-line balanced, unmatched, multi-open,
  cross-indented, crossed, and otherwise ambiguous structures;
- source-order roots and siblings;
- bottom-up nonrecursive tree construction;
- deeply frozen roots, child arrays, symbols, ranges, and positions;
- shared behavior across embedded Language Server and `dweave-lsp` transport;
- existing lifecycle, stale-mutation, URI, source, symbol-count, and name bounds.

## Excluded product contract

- a complete PlantUML AST;
- hierarchy inferred from indentation alone;
- members, attributes, methods, notes, relationships, implicit participants,
  aliases as separate nodes, macros, includes, preprocessing, or renderer output;
- workspace-level outline aggregation;
- hierarchy repair or syntax mutation;
- automatic source formatting;
- `SymbolInformation[]` fallback for legacy flat-only clients;
- a Studio tree widget in this backend slice.

These exclusions keep the result truthful. A declaration remains visible as a
root or leaf when ownership cannot be proven.

## Acceptance criteria

1. Complete nested package and namespace scopes return nested children.
2. Top-level and sibling declaration order remains source order.
3. Parent ranges enclose every child and end on the matched closing-brace line.
4. Selection ranges remain exact after multilingual text and emoji.
5. CR, LF, and CRLF sources produce correct zero-based lines.
6. Quoted and commented braces never create hierarchy.
7. Balanced one-line, unmatched, multi-open, cross-indented, crossed, and
   malformed scopes remain flat without a protocol error.
8. A matched inner scope may remain a root when its outer source is unproven.
9. Deep bounded nesting is constructed without recursive product traversal.
10. The global 1,024-symbol and 1,024-byte name limits cover the whole tree.
11. Diagnostics, declaration completion, stdio, package, and previous outline
    behavior remain compatible.
12. Production line, branch, and function coverage and production JSDoc remain
    100%.
13. Node.js 22/24 CI, exact package dry runs, SAST, Security Scan, CodeRabbit,
    and review threads pass on one exact head.

## Modular product fit

```text
accepted full-document snapshot
  -> diagnostic session
    -> document-symbol session
      -> conservative hierarchy
        -> embedded host or bounded stdio transport
```

Hierarchy stays inside the existing transport-neutral package. The stdio
adapter serializes the same result and does not own source or tree logic. Studio
and naruon may display, flatten, filter, or cache the immutable result, but must
not silently reparent declarations.

## Accessibility and Figma handoff

This PR does not implement visual UI. Before Studio ships a hierarchical
outline, Product Design and Figma must define:

- tree semantics, `aria-level`, expanded state, selected state, and set size;
- arrow-key navigation, Home/End, type-ahead, expand/collapse, Enter, Escape,
  and focus return to the source editor;
- source reveal and selected range synchronization;
- deep nesting, horizontal overflow, long labels, and narrow layouts;
- high contrast, magnification, reduced motion, and screen-reader announcements;
- malformed/flat fallback, empty outline, stale response, and unavailable
  states;
- an accessible flattened alternative with the same declaration order;
- coexistence with diagnostics and declaration completion.

The UI must consume server-provided `children`, `range`, and `selectionRange`
instead of reparsing braces.

## Product telemetry boundary

The foundation emits no analytics. A future host may record privacy-reviewed
aggregate events such as outline request latency, root count, maximum displayed
depth, expand/collapse action, and source-reveal success. It must not log labels,
source lines, comments, URIs, or malformed input.

## Release status

This is an unreleased foundation capability under package version `0.0.0` and
`CHANGELOG.md` `Unreleased`. It is not an independent release boundary. Studio,
legacy-client compatibility, cross-platform runtime evidence, packaging,
signing, SBOM/provenance, rollback, and commercial support evidence remain
required before a product release.
