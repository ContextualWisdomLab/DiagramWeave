# Conservative PlantUML folding-range research

## Decision summary

DiagramWeave implements LSP 3.18 `textDocument/foldingRange` only for package
and namespace scopes already proven by the conservative document-symbol
scanner. The feature is capability-gated, line-based, iterative, bounded,
immutable, renderer-free, LLM-free, file-free, and network-free.

## Language Server Protocol contract

The official Language Server Protocol site identifies version 3.18 as the
latest specification. The folding-range request has existed since LSP 3.10 and
uses the optional client capability:

```text
textDocument.foldingRange
```

A client may declare:

- `rangeLimit`: its preferred maximum number of ranges per document;
- `lineFoldingOnly`: whether it ignores character offsets;
- supported folding kinds;
- support for custom collapsed text.

The server advertises `foldingRangeProvider` and responds to
`textDocument/foldingRange` with `FoldingRange[] | null`.

A `FoldingRange` uses zero-based lines. Its folded area starts after the last
character of `startLine` and ends with the last character of `endLine`.
`startCharacter` and `endCharacter` are optional. DiagramWeave omits them, so
line-only and character-aware clients receive the same result and the
package/namespace declaration remains visible when the body collapses.

The standardized kinds are comments, imports, and regions. A PlantUML package
is none of those categories, so DiagramWeave omits `kind` rather than inventing
a custom value. It also omits `collapsedText`, avoiding a label channel that
would duplicate or expose source text.

## PlantUML grouping evidence

PlantUML's official class-diagram documentation supports packages and nested
package definitions. It also treats `namespace` as synonymous with package
grouping. DiagramWeave therefore limits folding to these two explicit grouping
kinds.

The existing scanner creates hierarchy only when one unmatched unquoted opening
brace on a package or namespace declaration is closed in stack order by a
standalone brace with identical indentation. Quoted and commented braces,
balanced one-line blocks, unmatched, cross-indented, multiple-opening, crossed,
malformed, include-dependent, macro-dependent, and renderer-dependent source
remains unproven.

Folding consumes that evidence rather than interpreting PlantUML again.

## One authoritative representation

The scanner first returns one deeply frozen source-order `DocumentSymbol[]`
tree. Proven parent ranges already begin on the declaration line and end on the
matched closing-brace line. The folding adapter walks this tree in source
preorder and maps only nonempty package and namespace scopes:

```text
DocumentSymbol.range.start.line -> FoldingRange.startLine
DocumentSymbol.range.end.line   -> FoldingRange.endLine
```

A second scanner would risk divergence on symbol kinds, aliases, comments,
delimiters, UTF-16 positions, malformed source, total limits, and future parser
hardening. Reuse also ensures Studio, IDEs, `dweave-lsp`, naruon, and other CWL
hosts observe one structure.

## Empty scopes

A two-line empty scope has an opening declaration followed immediately by its
closing brace. Folding it would hide only the closing line and provide no useful
vertical reduction. DiagramWeave therefore requires:

```text
endLine >= startLine + 2
```

A scope with any interior line, including a blank or comment line, is foldable
because collapsing it removes vertical space while preserving the declaration.
Balanced one-line scopes never become proven hierarchy and remain non-foldable.

## Range limits

LSP describes `rangeLimit` as a client preference. DiagramWeave accepts an LSP
unsigned integer from 0 through 2,147,483,647 and honors it as a deterministic
source-order prefix. The output is still capped at the authoritative 1,024
symbol ceiling.

A zero limit returns a shared frozen empty collection. A larger value cannot
create more ranges than proven grouping symbols. Invalid or hostile option data
fails closed to an unsupported provider rather than producing dynamic errors or
an unbounded result.

## Line-only semantics

DiagramWeave returns only `startLine` and `endLine`. It does not need separate
output for `lineFoldingOnly` clients because omitted character offsets already
mean that the fold begins after the start line's last character and ends with
the end line's last character.

This keeps output identical across client classes and avoids branches that do
not change semantics.

## Iterative traversal and immutability

A reverse stack produces source preorder without recursive product traversal.
Parents precede descendants and siblings preserve source order. A 512-level
regression fixture demonstrates bounded deep-tree behavior without dependence
on the JavaScript call stack.

The engine freezes each range and the result array. It copies no source label,
comment, or excerpt. Existing source-size, symbol-count, name-size, URI, open
document, lifecycle, and stale-mutation contracts remain unchanged.

## Security and privacy

Folding computation:

- reads only the latest accepted in-memory source snapshot;
- never dereferences or reads the document URI;
- never starts PlantUML or another process;
- never invokes an LLM;
- never evaluates includes, macros, relations, or members;
- never opens a workspace or network connection;
- never emits source, labels, comments, renderer output, executable paths,
  rejected values, credentials, or host exception text;
- persists no source and adds no telemetry.

## Product implication

Large architecture files gain native editor collapse behavior while retaining
DiagramWeave's source-first and offline contracts. Because the feature is a
transport-neutral LSP layer, it benefits Studio, IDE adapters, the bounded
`dweave-lsp` executable, naruon, and other CWL hosts without duplicating UI or
parser logic.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol*. Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/

Microsoft. (2026). *Language Server Protocol specification, version 3.18*.
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

Microsoft. (2026). *Language Server Protocol: Folding range request*.
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/#textDocument_foldingRange

PlantUML. (n.d.). *Class diagram syntax and features*. Retrieved August 5, 2026,
from https://plantuml.com/class-diagram
