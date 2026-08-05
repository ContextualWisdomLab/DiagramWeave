# PlantUML Document Symbol Outline Design

## Context

DiagramWeave has safe PlantUML diagnostics, a transport-neutral LSP session,
and a bounded stdio process, but manual authors still cannot navigate a large
source document from an outline. PRD FR-011 requires document symbols and an
overview reusable by Studio and external IDEs.

## Approaches considered

### Full PlantUML parser first

A full parser could return nested packages, members, definitions, and
references. It also requires preprocessing, include policy, diagram-mode
disambiguation, and a broad compatibility corpus. That scope is too large for
one reviewable product increment.

### Renderer-derived symbols

Asking PlantUML or rendered SVG for semantic elements would couple live editing
to a subprocess, lose reliable source ranges, and potentially expose renderer
implementation details. It also cannot serve symbols while source is
temporarily invalid.

### Conservative explicit-declaration scanner — selected

A small source scanner recognizes only documented declaration keywords and
well-delimited labels. It provides immediate source-linked value, operates
without an LLM or renderer result, stays reusable in every host, and fails by
omission rather than fabrication.

## Architecture

```text
LSP client full source snapshots
          │
          ▼
Document-symbol session wrapper
  ├─ delegates diagnostics/lifecycle to existing session
  ├─ owns sanitized open-document snapshots
  ├─ orders concurrent mutations by epoch and sequence
  └─ handles textDocument/documentSymbol
          │
          ▼
Conservative PlantUML symbol scanner
  ├─ UTF-16-preserving comment mask
  ├─ explicit declaration matcher
  ├─ quoted / paired / bare / aliased label parser
  └─ frozen bounded DocumentSymbol[]
```

The existing diagnostic session remains unchanged. The package root exports the
new wrapper under the established `createLanguageServerSession` name, so the
stdio transport and embedders receive the capability without duplicating state.

## Symbol contract

The result is flat and follows declaration order. Each symbol contains:

- `name`: displayed label, not an inferred identifier;
- `detail`: normalized declaration keyword;
- `kind`: stable LSP `SymbolKind` mapping;
- `range`: non-whitespace declaration line;
- `selectionRange`: displayed label only.

Package nesting is not inferred in this slice. Flat output remains valid LSP and
avoids incorrect children when braces, macros, or mixed diagram syntax are
ambiguous.

## Syntax scope

Supported explicit keywords:

```text
package namespace class abstract class interface enum annotation entity object
participant actor boundary control database collections queue component node
cloud frame folder artifact file stack storage card agent rectangle usecase state
```

The label parser accepts quoted strings, parenthesized use cases, bracketed
components, colon-delimited actors, bare names, and aliases. When the first
label is delimited it is displayed. When the first label is bare and the label
after `as` is delimited, the second label is displayed. Otherwise the first bare
label remains authoritative.

The scanner ignores relations, implicit participants, directives, members,
macros, multiline blocks, malformed delimiters, and inferred symbols.

## UTF-16 and comments

The session advertises UTF-16. Comment masking therefore works on UTF-16 code
units rather than code points. Line comments and block comments are replaced by
spaces of equal code-unit length. Double-quoted labels protect apostrophes and
comment-like delimiters. Escaped and doubled quotes do not terminate a label
early.

## Concurrency

Every open, change, and close starts a mutation with `(epoch, sequence)`. Active
mutations are retained by URI and the latest applied sequence is recorded.
A completion applies only when:

1. its epoch is current;
2. the session is active;
3. it is still active;
4. it is newer than the latest applied mutation;
5. no higher active sequence exists.

This lets an older valid operation complete after a rejected newer operation,
while preventing it from overwriting a newer successful change. Shutdown, exit,
and disposal increment the epoch and clear all state.

## Limits and errors

- source snapshot: 1 MiB UTF-8;
- open documents: 256;
- symbols per document: 1,024;
- symbol name: 1,024 UTF-8 bytes;
- local `.puml`/`.plantuml` file URIs only.

New stable errors are `document_symbols_too_many` and
`document_symbol_name_too_large`. All public records are deeply frozen and no
source excerpt or runtime path is included in errors.

## Testing

Tests cover mixed real-world declaration families, aliases on both sides,
multilingual names, emoji and UTF-16 ranges, LF/CRLF/CR, line and block comments,
comment-like text inside labels, escaped and doubled quotes, malformed
constructs, implicit relations, all bounds, lifecycle, rejected mutations,
concurrent open/change/close races, and a full stdio JSON-RPC round trip.

Repository gates remain Node.js 22 and 24, zero skipped/todo tests, 100%
production statement/branch/function coverage, complete production JSDoc,
syntax, package dry runs, SAST, security scans, CodeRabbit, and resolved review
threads.

## Release decision

Keep version `0.0.0` under `Unreleased`. This closes the first outline gap but
not completion, navigation, hierarchical parsing, Studio UI, packaging, or
cross-platform runtime validation.
