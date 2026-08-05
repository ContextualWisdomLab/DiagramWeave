# Legacy document-symbol fallback design

**Status:** Implemented; exact-head verification pending  
**Date:** 2026-08-05  
**Scope:** `@contextualwisdomlab/diagramweave-language-server`

## Problem

DiagramWeave now returns conservative hierarchical LSP 3.18 `DocumentSymbol[]`
trees. That is the best result for Studio and modern IDE clients, but the
Language Server currently ignores the client's
`textDocument.documentSymbol.hierarchicalDocumentSymbolSupport` capability.
Clients that omit or reject hierarchical symbols therefore receive a response
shape they did not advertise.

The buyer-visible result is inconsistent outline support across older IDEs,
minimal editors, `dweave-lsp`, naruon, and other CWL hosts. Hosts should not
need to reparse PlantUML or flatten DiagramWeave trees independently.

## Standards basis

The latest published Language Server Protocol specification is version 3.18.
The `textDocument/documentSymbol` request supports hierarchical
`DocumentSymbol[]` only when the client advertises
`hierarchicalDocumentSymbolSupport`; the legacy-compatible result is
`SymbolInformation[]`. Each flat record carries a `Location` and may name its
immediate container.

## Chosen approach

Keep the current document-symbol scanner as the single semantic authority.
After the scanner produces its deeply frozen `DocumentSymbol[]` tree, the
session chooses one of two presentation contracts captured during initialize:

1. clients that explicitly advertise `hierarchicalDocumentSymbolSupport: true`
   receive the existing tree unchanged;
2. every other client receives a deterministic flat `SymbolInformation[]` view
   derived from the same tree.

The compatibility view is created by a focused pure module rather than by
adding legacy fields to the scanner. This preserves one parsing implementation
and keeps protocol adaptation separate from PlantUML recognition.

## Alternatives rejected

1. **Always return the hierarchy.** This preserves current behavior but violates
   capability negotiation and leaves older clients unsupported.
2. **Maintain a second flat PlantUML scanner.** Two scanners would drift on
   aliases, comments, UTF-16 ranges, limits, and malformed syntax.
3. **Infer support from client name or version.** Client identity is optional,
   spoofable, and less precise than the standard capability flag.
4. **Flatten in the stdio package.** Embedded Studio, IDE, naruon, and service
   hosts would then diverge from `dweave-lsp`.

## Capability contract

The server probes only this path:

```text
params.capabilities.textDocument.documentSymbol.hierarchicalDocumentSymbolSupport
```

Support is true only when every containing value is a plain record and the final
value is exactly boolean `true`. Missing values, false, malformed structures,
arrays, hostile getters, proxies, and thrown accessors fail closed to the flat
result without leaking dynamic values.

`documentSymbolProvider: true` remains advertised to every initialized client.
The negotiated presentation mode is immutable for the lifetime of the session.

## Flat output contract

The compatibility module accepts one validated local document URI and one
trusted frozen `DocumentSymbol[]` tree. It returns deeply frozen
`SymbolInformation[]` in source pre-order.

Each item contains:

- `name`: the authoritative symbol display name;
- `kind`: the existing LSP symbol kind;
- `location.uri`: the validated caller-supplied local document identifier;
- `location.range`: the authoritative enclosing symbol range;
- `containerName`: the immediate parent symbol name, omitted for roots.

The module does not add `deprecated`, tags, detail, selection range, source
excerpt, raw PlantUML text, or inferred semantic ownership. Root and sibling
order remains source order. A reverse stack performs traversal without recursive traversal
or product recursion, including for the maximum bounded hierarchy.

## Immutability and limits

The existing document ceiling of 1 MiB, total symbol ceiling of 1,024, and
symbol-name ceiling of 1,024 UTF-8 bytes remain authoritative. The flat view
cannot contain more records than the source tree.

The result array, every symbol-information record, every location, and every
new object are frozen. Existing frozen ranges and positions may be reused
because they are already trusted immutable values.

## Lifecycle and concurrency

The current symbol session continues to own accepted full-document snapshots
and mutation ordering. The compatibility choice changes only response
presentation. Open, change, close, shutdown, exit, dispose, rejected mutation,
and stale renderer-completion behavior remains unchanged.

The outer completion session delegates initialize and document-symbol requests
to this layer, so completion capability negotiation and source ownership remain
independent.

## Security and privacy

The feature:

- performs no file read or URI dereference;
- performs no LLM, renderer, include, macro, shell, workspace, or network work;
- returns only the same validated local URI supplied by the requesting client;
- never echoes rejected URI values, source text, comments, labels, renderer
  output, paths from host exceptions, or credentials in errors;
- treats capability objects as hostile and fails closed;
- does not persist source or telemetry.

## Verification

The exact-head merge gate requires:

- pure flattening tests for roots, nested scopes, immediate containers, source
  order, ranges, and deep immutability;
- a 512-level hierarchy fixture proving non-recursive traversal;
- hierarchical true, false, absent, malformed, and hostile capability tests;
- unchanged lifecycle, stale-mutation, rejected-mutation, diagnostics, and
  completion behavior;
- real bounded stdio round trips for both response shapes;
- exact package-content verification including the new production module;
- repository documentation contract tests;
- production line, branch, and function coverage at 100%;
- production JSDoc coverage at 100%;
- Node.js 22 and 24 CI, SAST, Security Scan, CodeRabbit, and zero unresolved
  review threads on one immutable head;
- zero skipped, ignored, todo, or expected-failure tests.

## Product and Figma boundary

This protocol-compatibility slice changes no Studio visual component, so it does
not require a new Figma file. A future Studio outline must consume hierarchical
symbols and must not request the legacy flat mode. Legacy mode exists for
external clients that cannot represent the tree.

## Release boundary

The capability remains under package version `0.0.0` and `CHANGELOG.md`
`Unreleased`. It is not independently releaseable without Studio,
cross-platform runtime evidence, packaging, signing, SBOM/provenance, rollback,
and support evidence.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol specification, version 3.18*.
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

Microsoft. (2026). *Language Server Protocol*. Retrieved August 5, 2026, from
https://microsoft.github.io/language-server-protocol/
