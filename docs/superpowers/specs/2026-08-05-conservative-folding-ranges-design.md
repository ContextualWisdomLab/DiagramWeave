# Conservative PlantUML folding-ranges design

**Status:** Approved for bounded implementation  
**Date:** 2026-08-05  
**Scope:** `@contextualwisdomlab/diagramweave-language-server`

## Problem

DiagramWeave can diagnose, outline, and complete large PlantUML documents, and
it now serves both hierarchical and legacy-flat document-symbol clients. The
same large source still cannot be collapsed through the Language Server.
Architects navigating nested package and namespace blocks must therefore scroll
through every declaration even though DiagramWeave already owns conservative,
source-bounded scope evidence.

The next buyer-visible slice adds `textDocument/foldingRange` without creating a
second parser, evaluating PlantUML, or inferring structure from indentation.

## Standards basis

The latest published Language Server Protocol specification is version 3.18.
The `textDocument/foldingRange` request has existed since LSP 3.10. A client
advertises the optional `textDocument.foldingRange` capability and may provide a
preferred `rangeLimit` and `lineFoldingOnly` flag. The server advertises
`foldingRangeProvider` and returns `FoldingRange[] | null`.

A folding range uses zero-based lines. The folded area starts after the last
character of `startLine` and ends with the last character of `endLine`. Omitting
`startCharacter` and `endCharacter` is therefore valid for both line-only and
character-aware clients and preserves the declaration line as the visible
collapsed label.

PlantUML's official class-diagram documentation supports nested package blocks
and treats `namespace` as synonymous with package grouping. DiagramWeave already
recognizes those grouping declarations and proves their complete brace scopes.

## Chosen approach

Reuse `documentSymbolsForSource(source)` as the only structural authority. The
existing scanner produces a deeply frozen source-order `DocumentSymbol[]` tree
and extends a proven package or namespace range through its matched standalone
closing-brace line. The folding engine walks that tree iteratively and emits one
range for each nonempty proven grouping scope.

The public session gains one outer composition layer:

```text
diagnostic session
  -> document-symbol session
    -> declaration-completion session
      -> folding-range session
```

The folding layer owns only accepted source snapshots and the initialize-time
folding capability. It delegates every existing method unchanged.

## Alternatives rejected

1. **Scan braces again in a folding module.** A second structural scanner would
   drift from outline behavior on quoted labels, comments, aliases, malformed
   braces, grouping kinds, and UTF-16 ranges.
2. **Fold every multi-line declaration.** Class and component bodies can contain
   members rather than nested declarations, so their symbol range is not proof
   of a grouping contract.
3. **Infer folds from indentation.** PlantUML indentation is presentational and
   cannot establish ownership.
4. **Ask the renderer or LLM.** Folding must remain instant, offline,
   deterministic, private, and available when Java or a model provider fails.
5. **Implement folding only in `dweave-lsp`.** Embedded Studio, IDE, naruon, and
   service hosts would diverge from the process transport.

## Capability contract

The folding provider is enabled only when the initialize request contains a
plain record at:

```text
params.capabilities.textDocument.foldingRange
```

The layer reads only `rangeLimit` and `lineFoldingOnly` under a guarded hostile
boundary.

- absent capability: provider is not advertised;
- plain capability with absent `rangeLimit`: use the authoritative maximum of
  1,024 ranges, equal to the total symbol ceiling;
- plain capability with integer `rangeLimit` from 0 through 2,147,483,647:
  honor that preferred limit exactly;
- malformed, array-valued, proxied, revoked, or throwing capability data: do not
  advertise or serve folding;
- `lineFoldingOnly` may be absent or boolean; another type fails closed;
- the negotiated options are immutable for the session lifetime.

A request made when folding was not negotiated returns the existing fixed
`method_not_found` Language Server error.

## Pure folding contract

The engine accepts a complete source string and an already validated nonnegative
range limit. It calls the authoritative symbol scanner exactly once and returns
a deeply frozen source-order `FoldingRange[]`.

A symbol produces a range only when all conditions hold:

- `detail` is exactly `package` or `namespace`;
- its scanner range spans at least three lines, so at least one line exists
  between the declaration and closing brace;
- the range was therefore proven by the existing conservative scanner;
- the client limit has not been reached.

The returned shape is deliberately minimal:

```json
{
  "startLine": 3,
  "endLine": 11
}
```

`startCharacter`, `endCharacter`, `kind`, and `collapsedText` are omitted.
Package folding is not one of the standard `comment`, `imports`, or `region`
kinds, and no custom kind is needed. Omitting character offsets gives identical
semantics to line-only and character-aware clients.

An empty two-line scope such as:

```plantuml
package Empty {
}
```

does not produce a range because collapsing only the closing-brace line provides
no buyer value. A scope containing at least one interior line does produce one,
even if that line is blank or a comment, because the scanner has proven the
scope and the fold hides meaningful vertical space.

## Ordering and client limits

A reverse stack walks the authoritative tree in source preorder without recursive product traversal. Parents precede descendants and siblings retain
source order. The engine stops once `rangeLimit` records have been emitted. A
zero limit returns one shared frozen empty collection.

Following a deterministic prefix rather than selecting the shallowest or
largest scopes avoids inventing a second prioritization policy and preserves
repeatability across Studio, IDEs, stdio, and naruon. The LSP describes
`rangeLimit` as a client preference, but honoring it exactly provides a stable
bounded contract.

## Immutability and resource bounds

- complete source remains limited to 1 MiB;
- the scanner accepts at most 1,024 symbols;
- folding output is therefore bounded by 1,024 even when the client reports a
  larger preference;
- the result array and every range record are frozen;
- traversal is iterative and bounded by the authoritative tree;
- no source excerpt or label is copied into folding output.

## Lifecycle and concurrency

The folding session mirrors only successful full-document opens and changes.
It uses the same epoch, active mutation sequence, last-applied sequence, and
close invalidation pattern as the existing completion and symbol layers.

Consequences:

- a rejected newer mutation cannot suppress an older valid completion;
- an older completion cannot overwrite a newer accepted source;
- close during validation prevents snapshot resurrection;
- shutdown, exit, and dispose clear all folding source;
- folding never starts the renderer and reads only the latest accepted snapshot.

## Security and privacy

The feature:

- performs no file read, file write, URI dereference, workspace scan, or network
  request;
- performs no renderer, LLM, include, macro, shell, or arbitrary-code work;
- emits only bounded line numbers;
- never emits source, comments, labels, raw renderer output, Java/JAR paths,
  rejected URI values, host exception text, or credentials;
- treats initialize capabilities and request parameters as hostile;
- persists no source and adds no telemetry or database object.

## Verification

The exact-head merge gate requires:

- pure-engine tests for nested scopes, siblings, empty and one-line scopes,
  malformed and ambiguous braces, source order, frozen results, and range
  limits;
- CR, LF, CRLF, multilingual labels, and emoji evidence inherited from and
  exercised through the authoritative scanner;
- a 512-level hierarchy fixture proving iterative traversal;
- supported, absent, false-equivalent, malformed, and hostile capability paths;
- lifecycle, rejected mutation, stale mutation, close race, shutdown, exit, and
  disposal evidence;
- real bounded stdio round trips for supported and unsupported clients;
- exact package-content verification including new production modules;
- repository standards, operations, product, architecture, PRD, and changelog
  contracts;
- production line, branch, and function coverage at 100%;
- production JSDoc coverage at 100%;
- zero skipped, ignored, todo, or expected-failure tests;
- Node.js 22 and 24 CI, SAST Semgrep, Security Scan, CodeRabbit, and zero
  unresolved review threads on one immutable head.

## Product Design and Figma boundary

This slice adds a standard editor capability and no DiagramWeave Studio visual
component. It does not require a new Figma artifact. A future Studio editor may
add fold controls, keyboard commands, persistence, or a minimap, and that UI
work must then receive Product Design and Figma interaction coverage.

## Release boundary

The capability remains under package version `0.0.0` and `CHANGELOG.md`
`Unreleased`. It is not independently releaseable without the integrated Studio,
cross-platform runtime evidence, packaging, signing, SBOM/provenance, rollback,
and support evidence.

## References — APA 7th edition

Microsoft. (2026). *Language Server Protocol specification, version 3.18*.
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

Microsoft. (2026). *Language Server Protocol: Folding range request*.
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/#textDocument_foldingRange

PlantUML. (n.d.). *Class diagram syntax and features*. Retrieved August 5, 2026,
from https://plantuml.com/class-diagram
