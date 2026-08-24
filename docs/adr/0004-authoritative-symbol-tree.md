# ADR-0004: Reuse one authoritative conservative symbol tree

**Status:** Accepted
**Date:** 2026-08-09
**Updated:** 2026-08-24

## Context

Editor intelligence needs outlines, completion context, folding, hover,
definition, and references that agree about the same declarations and ranges.
Separate feature parsers would drift, especially around PlantUML's implicit
participants, relation endpoints, includes, macros, and quoted labels.

The Language Server Protocol defines document symbols as constructs inside one
text document, with a display name, kind, full `range`, and narrower
`selectionRange`, and it uses UTF-16 positions unless another encoding is
negotiated (Microsoft, n.d.). PlantUML's official class-diagram and
sequence-diagram records define explicit package, class, participant, and
related declaration syntax, including aliases and quoted display names
(PlantUML, n.d.-a, n.d.-c). Those records do not authorize inferring symbols
from relations, includes, or renderer output.

PlantUML outlines must therefore fail by omission rather than invent implicit,
malformed, included, or macro-generated symbols.

## Decision

Document symbols, flat compatibility symbols, completion context, folding,
hover, definition, and compatible later navigation features derive from one
bounded conservative structural tree over the latest accepted source snapshot.
Hierarchy is created only when complete explicit syntax proves ownership.
Ambiguous PlantUML syntax fails by omission. This prevents feature-specific
parsers from disagreeing about declarations and ranges.

Hierarchy requires one unmatched unquoted package or namespace declaration
brace closed in stack order by a standalone brace with identical indentation.
Exact boolean `hierarchicalDocumentSymbolSupport: true` selects
`DocumentSymbol[]`; every other capability state derives frozen
`SymbolInformation[]` from the same tree.

## Consequences

- Features walk the same frozen tree iteratively. A second PlantUML scanner is
  not introduced for compatibility, folding, hover, definition, or references.
- Quoted, commented, incomplete, crossed, or malformed structure remains flat
  or omitted. Duplicate or ambiguous identifiers do not produce a guessed
  target.
- UTF-16 code-unit offsets are preserved through multilingual text and emoji;
  comment masking must not shift later ranges.
- Studio, IDE adapters, `dweave-lsp`, naruon, and other CWL hosts reuse the
  same session results.
- A future full PlantUML semantic AST, include expansion, or workspace index
  would be a new ADR, not an implicit widening of this tree.

## References — APA 7th edition

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 24, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (n.d.-a). *Class diagram*. Retrieved August 24, 2026, from
https://plantuml.com/class-diagram

PlantUML. (n.d.-b). *PlantUML Language Reference Guide*. Retrieved August 24,
2026, from https://plantuml.com/guide

PlantUML. (n.d.-c). *Sequence diagram*. Retrieved August 24, 2026, from
https://plantuml.com/sequence-diagram
