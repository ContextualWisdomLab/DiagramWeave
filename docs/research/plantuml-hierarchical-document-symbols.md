# PlantUML hierarchical document-symbol standards record

## Decision

DiagramWeave extends its LSP 3.18 `textDocument/documentSymbol` result from a
flat declaration list to a conservative `DocumentSymbol` tree. Hierarchy is
created only when a comment-masked explicit PlantUML declaration contains one
unquoted opening brace and that brace is closed in stack order by a standalone
closing brace with exactly the same indentation.

The implementation remains a bounded local scanner rather than a complete
PlantUML parser. It performs no renderer invocation, preprocessing, include or
macro evaluation, file read, URI dereference, LLM call, workspace scan, shell
execution, or network request.

## LSP hierarchy contract

Language Server Protocol 3.18 permits a `DocumentSymbol` to contain an optional
`children` array. The protocol defines `range` as the range enclosing the
symbol, including leading or trailing source associated with that declaration,
while `selectionRange` identifies the range that should be selected when the
symbol is chosen. The selection must be contained by the enclosing range.

DiagramWeave therefore applies the following rules:

- a leaf or structurally ambiguous declaration keeps its declaration-line
  range;
- a proven scope begins at the first non-indentation character of its
  declaration line and ends at the end of its matched closing-brace line;
- `selectionRange` continues to cover only the displayed declaration label;
- a proven child is included in the nearest proven enclosing scope;
- roots and siblings remain in declaration order;
- `children` is omitted when no proven child exists;
- roots, child arrays, symbols, ranges, and positions are frozen before they
  cross the package boundary.

This preserves compatibility for documents without complete scope evidence and
lets capable clients render a native outline tree without reparsing source.

## PlantUML structural evidence

PlantUML's official class-diagram documentation describes package and namespace
declarations and explicitly permits package definitions to be nested. The same
page documents quoted display labels and aliases, so a brace displayed inside a
quoted label cannot be treated as a structural delimiter. PlantUML also permits
comments and extensive declaration bodies, which makes unqualified brace
counting unsafe.

The first hierarchical slice deliberately recognizes only the existing
high-signal declaration catalog. Any explicit declaration may own a proven
brace interval, but no hierarchy is inferred from indentation alone. The
implementation does not claim that every PlantUML brace denotes one of these
outline scopes.

## Conservative matching algorithm

For each line, DiagramWeave first replaces PlantUML line and block comments with
spaces while preserving UTF-16 length. It then scans unquoted structural braces
using the same escaped-quote and doubled-quote rules as label parsing.

A declaration is eligible to open a scope only when the complete masked line
contains exactly one structural token and that token is `{`. A balanced
one-line block, more than one opening brace, an unquoted closing brace on the
same line, or a brace appearing on a non-declaration line remains structural
context but is not an outline-scope candidate.

All structural opening braces enter one stack. Non-candidate braces enter as
anonymous entries. A closing brace removes only the top entry. A candidate is
accepted only when:

1. the closing line contains exactly one structural token;
2. the comment-masked line is only indentation, `}`, and whitespace;
3. the closing indentation exactly equals the candidate declaration's
   indentation.

A mismatched or non-standalone close invalidates that candidate rather than
searching deeper in the stack. Anonymous or ambiguous braces prevent a later
brace from being incorrectly paired with an earlier declaration. This is why a
matched inner scope may remain a top-level symbol when an outer declaration is
unmatched or ambiguous.

After all pairs are known, declarations are assigned to the nearest matched
interval that strictly contains their line. Tree objects are then built in
reverse declaration order, so children are already frozen when their parent is
constructed and no recursive product traversal is required.

## Omission boundaries

Hierarchy is intentionally omitted for:

- braces inside quoted, escaped-quote, or doubled-quote labels;
- braces inside line or block comments;
- balanced one-line declarations such as `package Empty { }`;
- unmatched opening or closing braces;
- multiple unmatched opening braces on one declaration line;
- closing braces with different indentation;
- crossed or out-of-stack closing attempts;
- implicit participants, relationships, members, notes, directives, macros,
  includes, and malformed labels;
- source structure that requires renderer or preprocessor interpretation.

Omission is safer than assigning source to a false owner. Hosts may still show
every explicit declaration as a root or leaf.

## Bounds and evidence

The existing session ceilings remain authoritative:

- source snapshot: 1 MiB UTF-8;
- open documents: 256;
- explicit symbols across the entire tree: 1,024;
- symbol display name: 1,024 UTF-8 bytes;
- local URI identifier: 4,096 UTF-8 bytes.

Tests cover nested package and namespace declarations, source-order siblings,
multiline enclosing ranges, multilingual labels and emoji, LF/CRLF/CR source,
quoted and commented braces, unmatched and ambiguous structure, deep bounded
nesting, immutable trees, and preservation of all previous flat contracts.

## References — APA 7th edition

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (n.d.). *Class diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/class-diagram
