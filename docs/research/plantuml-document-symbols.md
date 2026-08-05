# PlantUML document-symbol standards record

## Decision

DiagramWeave implements `textDocument/documentSymbol` as a conservative,
transport-neutral Language Server Protocol 3.18 capability. The Language Server
returns `DocumentSymbol[]` in declaration order for explicit PlantUML elements
that can be identified without evaluating includes, macros, relations, or
renderer output.

LSP 3.18 defines document symbols as program constructs such as classes,
interfaces, functions, and variables inside one text document. A
`DocumentSymbol` contains a display name, `SymbolKind`, full declaration
`range`, and a narrower `selectionRange`. DiagramWeave therefore advertises
`documentSymbolProvider: true`, uses the session's UTF-16 position encoding, and
keeps every selection inside its declaration-line range.

## Conservative PlantUML grammar

PlantUML's official class-diagram documentation defines explicit package,
namespace, class, abstract class, interface, annotation, enum, and entity
syntax, including quoted display names and aliases on either side of `as`.
The sequence-diagram documentation defines explicit participant, actor,
boundary, control, entity, database, collections, and queue declarations and
supports display labels before or after aliases. Deployment-diagram
documentation defines explicit component-like elements such as artifact, card,
cloud, component, database, file, folder, frame, node, package, queue,
rectangle, stack, and storage.

The first DiagramWeave scanner supports that high-signal subset plus explicit
object, agent, usecase, and state declarations. It deliberately omits implicit
participants, relation endpoints, members, directives, macros, multiline
participant blocks, inferred package nesting, and malformed labels. Returning
fewer trustworthy symbols is preferable to fabricating an outline that points
to the wrong source.

## Position and comment handling

LSP uses UTF-16 positions unless another encoding is negotiated. JavaScript
string indices are UTF-16 code-unit offsets, so the scanner masks comments with
a code-unit-preserving representation rather than code-point iteration. This
keeps ranges correct after emoji and other supplementary characters.

PlantUML line comments begin with an apostrophe and block comments use `/'` and
`'/`. The scanner replaces comment code units with spaces while retaining line
lengths. Apostrophes and comment-like delimiters inside double-quoted labels do
not start comments. Escaped and doubled quote forms are scanned without moving
later UTF-16 offsets.

## Bounds and concurrency

One open document may expose at most 1,024 symbols and each display name is
limited to 1,024 UTF-8 bytes. Source remains subject to the existing 1 MiB
session ceiling. Results are deeply frozen and derived only from sanitized
full-document snapshots already accepted by the diagnostic session.

Each accepted open, change, or close operation receives an epoch and mutation
sequence. Active mutations and the latest applied sequence ensure that:

- an older completion cannot overwrite a newer accepted snapshot;
- a rejected newer mutation does not suppress an older valid completion;
- close, shutdown, exit, and disposal cannot be undone by late work.

## References — APA 7th edition

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (n.d.). *Class diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/en-dark/class-diagram

PlantUML. (n.d.). *Deployment diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/deployment-diagram

PlantUML. (n.d.). *Sequence diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/en/sequence-diagram
