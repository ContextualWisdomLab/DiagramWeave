# PlantUML declaration-completion standards record

## Decision

DiagramWeave implements `textDocument/completion` as a deterministic,
transport-neutral Language Server Protocol 3.18 capability for explicit
PlantUML declaration keywords. Completion is derived only from the latest
accepted full-document snapshot and cursor position. It performs no LLM call,
network request, include evaluation, macro execution, renderer invocation, or
workspace scan.

The server advertises `completionProvider: { resolveProvider: false }` only
when the initialize request contains a plain
`capabilities.textDocument.completion` record. This keeps server behavior tied
to the capability exchange instead of assuming every client supports the
feature. A client that omits or hides the capability still receives the
existing diagnostics and document-symbol surface without completion
advertisement.

## LSP completion contract

LSP 3.18 identifies completion as a language feature normally computed from a
text-document and position tuple on synchronized document state. DiagramWeave
therefore accepts `textDocument/completion` only after initialize, initialized,
and a successful `textDocument/didOpen`. Later accepted full-document changes
replace the source snapshot; close, shutdown, exit, and disposal invalidate it.

Each result is an immutable `CompletionItem` with:

- `kind: 14`, the LSP keyword kind;
- a stable declaration label and deterministic `sortText`;
- `insertTextFormat: 1` for plain text;
- `filterText` equal to the declaration keyword;
- an explicit `textEdit` replacing only the line-leading typed prefix;
- UTF-16 line and character positions.

The first slice does not implement `completionItem/resolve`, snippets,
additional edits, semantic names, relation endpoints, member completion,
workspace symbols, or renderer-informed suggestions. Those require separate
contracts and tests rather than implicit expansion of this bounded surface.

Malformed completion parameters and invalid positions fail closed with stable
Language Server codes. The stdio adapter maps those parameter failures to the
JSON-RPC 2.0 `-32602` Invalid params response without source text, paths, or
caller-owned values.

## Conservative PlantUML catalog

The fixed catalog contains diagram boundaries plus explicit high-signal
declarations documented across PlantUML class, sequence, deployment, use-case,
and state syntax:

```text
@startuml
@enduml
package
namespace
class
interface
enum
annotation
entity
object
participant
actor
boundary
control
database
collections
queue
component
node
cloud
frame
folder
artifact
file
stack
storage
card
agent
rectangle
usecase
state
abstract class
```

The official class-diagram documentation describes declarative classes,
abstract classes, annotations, entities, enums, interfaces, aliases, packages,
and namespaces. Sequence-diagram documentation describes explicit participant,
actor, boundary, control, entity, database, collections, and queue declarations.
Deployment documentation lists the component-like shapes used by this catalog,
and the official use-case and state documentation define the corresponding
explicit declaration forms.

The catalog is intentionally smaller than PlantUML's complete language. It is a
safe authoring aid, not a claim that DiagramWeave has implemented a full
PlantUML grammar.

## Context and omission rules

Completion is offered only for an ASCII declaration prefix at the start of a
line after spaces or tabs. Matching is case-insensitive, while the inserted
keyword uses the canonical lowercase catalog spelling.

The engine returns the shared immutable empty collection when the cursor is:

- inside or after a PlantUML line comment;
- inside a block comment that began on the current or an earlier line;
- inside a quoted label, including escaped or doubled quote forms;
- after a relation, directive, declaration name, or other non-leading syntax;
- in the middle of an already typed keyword;
- at a safe prefix that matches no catalog entry.

Failing by omission prevents a local typing aid from rewriting relation text or
making semantic claims that require a parser. Comment scanning preserves
JavaScript UTF-16 code-unit offsets so multilingual source and supplementary
characters before the cursor do not shift the LSP range.

## Bounds, immutability, and concurrency

Source remains subject to the existing 1 MiB session ceiling. One request may
return no more than 64 completion items. The catalog, result collection,
completion items, positions, ranges, and text edits are frozen before crossing
the package boundary.

The completion wrapper composes the existing document-symbol and diagnostic
sessions. Accepted open, change, and close operations use epoch and mutation
sequence tracking so that:

- an older completion cannot replace a newer accepted snapshot;
- a rejected newer mutation cannot suppress an earlier valid completion;
- close, shutdown, exit, or disposal cannot be undone by late work.

The same transport-neutral implementation is reused by DiagramWeave Studio,
IDE adapters, `dweave-lsp`, naruon, and other CWL hosts.

## References — APA 7th edition

JSON-RPC Working Group. (2013). *JSON-RPC 2.0 specification*.
https://www.jsonrpc.org/specification

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (n.d.). *Class diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/class-diagram

PlantUML. (n.d.). *Deployment diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/deployment-diagram

PlantUML. (n.d.). *Sequence diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/sequence-diagram

PlantUML. (n.d.). *State diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/state-diagram

PlantUML. (n.d.). *Use case diagram syntax and features*. Retrieved August 5,
2026, from https://plantuml.com/use-case-diagram
