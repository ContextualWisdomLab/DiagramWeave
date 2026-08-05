# PlantUML document outline product slice

This slice advances PRD requirements G-01, G-06, FR-011, and JTBD-02 by giving
manual authors a fast, source-linked outline that works in Studio, IDE clients,
`dweave-lsp`, naruon, and other CWL hosts without an LLM.

## Buyer-visible outcome

A user opening a PlantUML document can navigate its explicit packages, types,
participants, components, deployment elements, use cases, and states from an
outline. Selecting an item uses its exact UTF-16 `selectionRange`; reveal and
highlight behavior stays in the host UI.

## Implemented

- LSP `textDocument/documentSymbol` request;
- `documentSymbolProvider: true` capability;
- flat declaration-order symbols for high-signal explicit PlantUML syntax;
- quoted and aliased display labels;
- comment masking that preserves UTF-16 positions after multilingual text and
  emoji;
- bounded and immutable source-derived records;
- exact open/change/close snapshot ownership;
- stale and rejected concurrent mutation handling;
- end-to-end stdio transport coverage.

## Deliberately deferred

- hierarchical package and namespace children;
- class fields, methods, enum members, and state substates;
- multiline participant declarations;
- symbols introduced by includes, preprocessing, macros, or remote content;
- workspace-wide symbol search;
- completion, hover, definition, references, and rename;
- Studio outline layout and interaction design.

The deferred features require a larger syntax and workspace model. They must not
be approximated by expanding regular expressions until the product has a
versioned parser contract and realistic compatibility corpus.

This slice is deliberately nonvisual, so it does not create a Figma artifact.
The first Studio outline implementation must use Figma and Product Design to
specify keyboard navigation, selection and reveal, empty and loading states,
long-name truncation, high-contrast focus, narrow layouts, and screen-reader
relationships before UI code is accepted.

## Success evidence

The merge gate requires realistic mixed-diagram fixtures, multilingual and emoji
positions, comment and alias edge cases, malformed declarations, source/name/
symbol limits, rejected mutations, concurrent stale completions, lifecycle
invalidation, and a real JSON-RPC stdio round trip. Production coverage and
JSDoc remain exactly 100%.
