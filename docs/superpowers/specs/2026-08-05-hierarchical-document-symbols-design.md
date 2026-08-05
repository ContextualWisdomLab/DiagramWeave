# Conservative PlantUML hierarchical document symbols design

**Status:** Approved for bounded implementation  
**Date:** 2026-08-05  
**Scope:** `@contextualwisdomlab/diagramweave-language-server`

## Problem

DiagramWeave currently returns a flat declaration-order `DocumentSymbol[]`.
That is useful for small files, but a buyer navigating a large architecture
source cannot see which classes belong to a package or namespace, which
sub-package owns a declaration, or where an explicit declaration block ends.
Studio, IDEs, naruon, and other CWL hosts would otherwise have to reconstruct
scope independently and would disagree on malformed or ambiguous source.

LSP 3.18 permits `DocumentSymbol.children` and defines a symbol `range` as the
range enclosing the symbol. PlantUML's official class-diagram documentation
explicitly permits nested package definitions. The next bounded slice therefore
adds hierarchy only when DiagramWeave can prove an explicit, indentation-matched
brace interval without evaluating macros, includes, relations, notes, or
renderer output.

## Chosen approach

Keep `documentSymbolsForSource` as a deterministic local scanner, but split its
work into two phases:

1. parse the same explicit declarations into flat internal records;
2. match conservative declaration scopes and build a deeply frozen tree.

A declaration becomes a scope only when its comment-masked line contains
exactly one unmatched unquoted opening brace and a later standalone closing
brace has the same indentation. Nested scopes must close in stack order.
Unmatched, cross-indented, multi-open, or otherwise ambiguous braces do not
create hierarchy.

This approach preserves every existing explicit declaration while adding
children only from complete structural evidence. It does not claim to be a
complete PlantUML parser.

Alternatives rejected:

1. **Use the PlantUML renderer or preprocess output.** That would add process,
   availability, include, macro, and privacy dependencies to local navigation.
2. **Infer hierarchy from indentation alone.** PlantUML indentation is not a
   semantic delimiter and would fabricate ownership.
3. **Treat every brace as structural.** Braces may appear in labels, comments,
   stereotypes, member text, or other PlantUML constructs.
4. **Add a recursive AST parser in this slice.** That would exceed the bounded
   product gap and delay a reliable outline improvement.

## Structural rules

### Declaration recognition

The existing high-signal declaration catalog remains authoritative. Label,
alias, comment, UTF-16, source-size, symbol-count, and name-size behavior is
unchanged.

### Opening scope

After comments are masked, a declaration line is scope-capable only when:

- braces inside quoted strings are ignored using the existing escaped and
  doubled-quote rules;
- the remaining line has one more `{` than `}`;
- the net unmatched opening count is exactly one;
- the opening belongs to the same explicit declaration line.

A balanced one-line declaration such as `package Empty { }` remains a leaf.
More than one unmatched opening brace is ambiguous and remains flat.

### Closing scope

A closing line must reduce after comment masking to:

```text
<same indentation as opener>}
```

Optional trailing line or block comments are already replaced with spaces.
The close must match the top active scope; a closing brace cannot skip an
unclosed nested scope. A mismatched close is ignored rather than changing the
outline.

### Parent assignment

Only matched scope intervals participate in hierarchy. A declaration is a
child of the innermost matched interval that strictly contains its declaration
line. An unmatched outer declaration does not absorb later declarations. A
matched inner scope may still become a top-level symbol when its surrounding
source is ambiguous.

### Ranges

- leaf and unmatched-scope ranges continue to cover the declaration line;
- a matched scope begins at the declaration's first non-indentation character;
- a matched scope ends at the end of its matched closing-brace line;
- every child range is therefore contained by its parent range;
- `selectionRange` continues to cover only the displayed label in UTF-16 code
  units.

## Immutability and non-recursive construction

At most 1,024 explicit symbols are accepted. Internal records may be mutable
while scanning, but no mutable record crosses the function boundary.

The final tree is constructed bottom-up in reverse declaration order so child
symbols are frozen before parents. This avoids recursive freezing and preserves
safe behavior for deeply nested but bounded documents. Root and child arrays,
individual symbols, ranges, and positions are frozen.

A `children` property is present only when a symbol has at least one proven
child. Empty and unmatched scopes remain ordinary leaves, avoiding expandable
but empty UI rows.

## Compatibility

- Existing declaration labels, kinds, details, ordering, and selection ranges do
  not change.
- Top-level order remains source declaration order.
- Sibling order remains source declaration order.
- Clients receive the same flat result when the source contains no complete
  conservative scope pair.
- This slice continues to return `DocumentSymbol[]`; a future separate
  compatibility slice may add `SymbolInformation[]` fallback for clients that
  do not advertise hierarchical document-symbol support.

## Security and privacy

Hierarchy computation:

- performs no file read or URI dereference;
- performs no LLM, renderer, macro, include, shell, workspace, or network work;
- stores no source beyond the existing accepted in-memory snapshot;
- emits no source excerpt, relation, member, comment text, or dynamic error;
- fails by omission for malformed and ambiguous structure.

## Verification

The exact-head merge gate requires:

- nested package and namespace examples from official PlantUML syntax;
- three-level hierarchy and sibling ordering;
- parent ranges ending on matched close lines;
- braces inside labels and comments ignored;
- one-line balanced, unmatched, multi-open, cross-indented, and crossed scope
  cases remaining flat;
- trailing comments on a valid close line;
- CR, LF, CRLF, multilingual, and emoji position evidence;
- deep nesting without recursive construction failure;
- total symbol and name limits applied across the whole tree;
- every existing diagnostics, completion, document-symbol, stdio, package, and
  repository contract still passing;
- production line, branch, and function coverage at 100%;
- production JSDoc coverage at 100%;
- Node.js 22 and 24 CI, package dry runs, SAST, Security Scan, CodeRabbit, and
  zero unresolved review threads on one immutable head.

## Product and Figma boundary

This backend slice does not add a Studio tree component. Before Studio ships the
hierarchical outline, Figma and Product Design must define expand/collapse,
keyboard tree navigation, focus restoration, selected-source reveal, deep-tree
indentation, long labels, empty states, high contrast, magnification, and an
accessible flattened fallback. The UI must use the server's range and children
contracts rather than reparsing source.

## Release boundary

The capability remains under package version `0.0.0` and `CHANGELOG.md`
`Unreleased`. It is not independently releaseable without the broader Studio,
cross-platform runtime, packaging, signing, SBOM/provenance, rollback, and
support evidence.
