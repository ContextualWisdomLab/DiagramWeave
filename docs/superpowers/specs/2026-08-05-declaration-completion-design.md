# Deterministic PlantUML declaration completion design

**Status:** Implemented foundation; exact-head verification required before merge  
**Date:** 2026-08-05  
**Scope:** `@contextualwisdomlab/diagramweave-language-server` and its bounded stdio adapter

## Problem

DiagramWeave already owns one reusable source snapshot for diagnostics and one
for document symbols, but manual authors still type explicit PlantUML
declaration keywords from memory. Adding completion independently in Studio,
IDE extensions, and naruon would duplicate catalog, lifecycle, position,
privacy, and concurrency logic.

The product needs a local completion foundation that is useful without an LLM
or renderer and that cannot silently expand into semantic rewriting.

## Chosen approach

Compose a declaration-completion session over the existing document-symbol
session:

```text
diagnostic session
  -> document-symbol session
    -> declaration-completion session
      -> embedded host or bounded JSON-RPC stdio connection
```

The completion layer owns only a sanitized copy of accepted full-document
source and mutation ordering metadata. It delegates diagnostics, document
symbols, renderer lifecycle, and base protocol behavior to the established
layers.

Alternatives rejected:

1. **Put completion in the diagnostic session.** This would make the lowest
   layer responsible for unrelated authoring semantics and complicate reuse.
2. **Compute completion directly in each host.** This would fragment behavior
   and repeat security-sensitive source-position logic.
3. **Use an LLM or renderer for candidates.** This would add network, latency,
   nondeterminism, privacy, and availability dependencies to a basic typing
   feature.

## Public protocol

A client advertises support through
`capabilities.textDocument.completion`. DiagramWeave returns
`completionProvider: { resolveProvider: false }` only for that capability path.
The request method is `textDocument/completion` with a local text-document URI
and UTF-16 position.

The response is a frozen array of frozen CompletionItems. Each item uses:

- LSP keyword kind `14`;
- stable catalog order and zero-padded `sortText`;
- plain-text insert format;
- exact `textEdit` range covering only the typed declaration prefix;
- no command, snippet, documentation lookup, or additional edit.

A client without completion support receives the previous initialize result
unchanged.

## Completion engine

The pure engine accepts a complete source string and position. It:

1. validates source type and the existing 1 MiB ceiling;
2. validates a nonnegative safe-integer line and UTF-16 character;
3. rejects positions beyond the synchronized source;
4. suppresses completion when the cursor splits an ASCII keyword;
5. scans earlier lines to preserve PlantUML block-comment state;
6. masks the current prefix without shifting UTF-16 offsets;
7. accepts only spaces/tabs followed by an ASCII or `@` declaration prefix;
8. filters the fixed catalog case-insensitively;
9. returns at most the public completion-item limit.

An empty immutable result is correct for comments, quotes, relations,
directives, completed declarations, mid-keyword positions, and nonmatching safe
prefixes.

## Source ownership and concurrency

Open, change, and close parameters are copied into frozen trusted records before
delegation. Each source mutation receives an epoch and monotonically increasing
sequence. Per-document active mutations and the latest applied sequence enforce:

- newer accepted source wins over older completion;
- a rejected newer operation does not suppress an earlier valid completion;
- close and lifecycle invalidation cannot be undone by late work.

No URI is dereferenced. Source never enters an error, log, telemetry event, or
provider request.

## Error model

The layer reuses stable Language Server errors:

- lifecycle errors before ready or after shutdown;
- `invalid_request` for malformed top-level parameter records;
- `document_position_invalid` for missing, hostile, or out-of-range positions;
- existing URI, size, version, language, and document-state errors.

The stdio adapter classifies `document_position_invalid` as JSON-RPC `-32602`
Invalid params. Dynamic values are not included in the response.

## Bounds

| Contract | Value |
|---|---:|
| source snapshot | 1 MiB UTF-8 |
| open documents | 256 |
| completion items | 64 |
| URI | 4,096 UTF-8 bytes |

The first catalog is below the result ceiling. A compatible catalog addition
must remain explicit, documented, deterministic, and covered by tests.

## Verification

The merge gate requires one exact head with:

- Node.js 22 and 24 repository verification;
- no skipped or ignored test;
- production line, branch, and function coverage at 100%;
- production JSDoc coverage at 100%;
- real stdio JSON-RPC completion round trip;
- malformed and hostile input tests;
- CR, LF, CRLF, multilingual, and emoji position tests;
- lifecycle and stale-mutation tests;
- package dry runs;
- SAST, security scan, CodeRabbit, and zero unresolved review threads.

## UI boundary

This design adds no Studio component. Figma and Product Design are required
before the first completion popup ships, covering keyboard and assistive
technology interaction, empty and stale states, focus restoration, high
contrast, magnification, and coexistence with diagnostics. The UI must apply the
server-provided text edit verbatim after validating the displayed document
version.

## Release boundary

The capability remains under `0.0.0` and `Unreleased`. It does not justify a
release until the broader Studio, cross-platform runtime, packaging, signing,
SBOM/provenance, rollback, and support gates are satisfied.
