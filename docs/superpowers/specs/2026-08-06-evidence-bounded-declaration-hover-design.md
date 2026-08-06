# Evidence-bounded declaration hover design

- **Status:** Approved by the standing autonomous product-development mandate
- **Date:** 2026-08-06
- **Product:** DiagramWeave
- **Bounded slice:** LSP 3.18 `textDocument/hover` for authoritative explicit declarations
- **Issue:** #16

## 1. Buyer problem

DiagramWeave already provides safe local diagnostics, document symbols, declaration completion, and folding. A user who encounters an unfamiliar explicit PlantUML declaration still has to read source syntax documentation or infer the declaration family from the keyword. This slows architecture review and makes the editor less approachable for technical PMs, business analysts, occasional PlantUML users, and reviewers working in large nested sources.

The existing document-symbol scanner already proves the declaration kind, displayed label, exact UTF-16 selection range, and immediate package or namespace parent. The product should expose that evidence through the standard hover protocol instead of creating a second parser or asking an LLM.

## 2. Selected approach

Implement a new outer `hover-session` layer over the current folding session and a pure `declarationHoverForSource` engine over `documentSymbolsForSource`.

The engine returns a hover only when the requested position lies inside one authoritative symbol `selectionRange`. It walks the frozen hierarchy iteratively, carries only the immediate proven container name, and returns `null` everywhere else. This preserves fail-by-omission behavior and prevents relation text, members, directives, malformed source, or renderer-dependent syntax from being presented as known semantics.

### Rejected alternatives

1. **Renderer-derived hover:** rejected because PlantUML renderer output is not a stable semantic API, would add process work to an editor interaction, and could expose source or raw diagnostics.
2. **Independent declaration parser:** rejected because symbol, folding, and hover could disagree and because a second parser expands the attack and maintenance surface.
3. **LLM-generated explanation:** rejected because hover must remain deterministic, local, offline, fast, source-bounded, and usable without credentials.
4. **Relation-endpoint resolution in the same slice:** rejected because references require alias identity, ambiguity handling, and a separate navigation design. That belongs in a later definition/references slice.

## 3. Protocol contract

### Client capability

A client enables the feature only with a plain `capabilities.textDocument.hover` record.

- Missing, array-valued, primitive, proxied, revoked, or throwing records do not advertise hover.
- If `contentFormat` is absent, the negotiated format is `plaintext`.
- If `contentFormat` is present, it must be a bounded nonempty array of strings.
- The server selects the first supported entry in client preference order from `markdown` and `plaintext`.
- A list without a supported entry, an oversized list, a non-string entry, or hostile access fails closed and does not advertise hover.

The initialize result adds immutable `hoverProvider: true` only after successful inner initialization.

### Request

The server accepts `textDocument/hover` with:

```json
{
  "textDocument": { "uri": "file:///workspace/model.puml" },
  "position": { "line": 3, "character": 8 }
}
```

The request must reference an open local `.puml` or `.plantuml` document. Line and character are nonnegative safe integers in UTF-16 coordinates and may equal the end of a source line. A position outside the source returns the stable `document_position_invalid` error. A valid position that is not inside an explicit declaration label returns `null`.

### Response

A successful match returns a deeply frozen LSP `Hover`:

```json
{
  "contents": {
    "kind": "plaintext",
    "value": "PlantUML class declaration\nName: Gateway\nContainer: api"
  },
  "range": {
    "start": { "line": 3, "character": 10 },
    "end": { "line": 3, "character": 17 }
  }
}
```

`Container` is omitted for a root declaration. Only the immediate proven package or namespace parent is shown. The response range is the same immutable selection range produced by the authoritative symbol tree.

For `markdown`, the same text is placed inside a fenced `text` code block. The fence length is one greater than the longest backtick run in the dynamic text and never shorter than three backticks. A declaration label therefore cannot terminate the fence or inject Markdown structure.

## 4. Pure engine

`packages/language-server/src/declaration-hover.js` exports:

```js
declarationHoverForSource(source, position, markupKind)
```

The function:

1. validates the source by calling `documentSymbolsForSource`;
2. validates the requested UTF-16 position against the source line table;
3. validates `markupKind` as `plaintext` or `markdown`;
4. walks the symbol tree iteratively in source preorder;
5. matches only a symbol selection range containing the cursor with an exclusive end;
6. creates bounded fixed-label text from symbol `detail`, symbol `name`, and the immediate parent name;
7. returns a deeply frozen hover and reuses the symbol's already frozen range;
8. returns `null` when there is no exact declaration-label match.

No recursion, renderer, LLM, filesystem, include, macro, workspace index, shell, or network call is permitted.

## 5. Session composition

`packages/language-server/src/hover-session.js` wraps `createFoldingLanguageServerSession` and owns only the latest accepted full-document source for hover.

It follows the established mutation contract:

- begin each open/change/close mutation with an epoch and monotonically increasing sequence;
- delegate the normalized mutation to the folding session first;
- copy or delete the hover snapshot only after every inner layer accepts the mutation;
- suppress an older successful completion while a newer mutation remains active;
- do not let a rejected newer mutation suppress an earlier valid mutation;
- invalidate every hover snapshot after shutdown, exit, or disposal;
- preserve source-free public errors.

The public package entry point aliases `createHoverLanguageServerSession` as `createLanguageServerSession`.

## 6. Security and privacy

- The URI is validated but never dereferenced.
- Source remains in memory and is never persisted by the Language Server.
- The response contains only data already visible in the selected declaration label and its proven immediate container.
- Markdown is fenced with a dynamic non-terminable delimiter.
- Errors contain no source, symbol name, URI, renderer path, host exception, or rejected capability value.
- Hostile getters, Proxy values, revoked proxies, array traps, and oversized capability arrays fail closed.
- The feature cannot contact a model or network service and does not weaken renderer sandboxing.

## 7. Accessibility and Product Design boundary

Hover is an enhancement, not the sole access path. Clients must retain source text, outline navigation, keyboard focus, and a non-hover route to equivalent declaration information. The protocol result uses exact text rather than color, animation, iconography, or pointer-only behavior.

This backend-only standard protocol slice does not require a new Figma artifact. Product Design and Figma become mandatory before DiagramWeave Studio introduces a custom hover card, pinning, focusable content, disclosure state, documentation links, or visual comparison.

## 8. Verification

Acceptance requires:

- root and nested declaration hovers;
- abstract-class detail;
- display labels and aliases;
- multilingual and emoji UTF-16 ranges across LF, CRLF, and CR;
- exact inclusive-start and exclusive-end behavior;
- plaintext and markdown negotiation;
- backtick fence-injection resistance;
- null results for relations, comments, directives, members, malformed declarations, and non-label positions;
- malformed and hostile capability and request boundaries;
- open/change/close, shutdown/exit/dispose, rejected mutation, stale completion, and close-race behavior;
- a 512-level hierarchy without recursive product traversal;
- real stdio round trips and method-not-found behavior for unsupported clients;
- exact package contents;
- production line, branch, and function coverage at 100%;
- production JSDoc coverage at 100%;
- Node.js 22 and 24 CI, SAST, Security Scan, CodeRabbit, and zero unresolved review threads on one exact head.

## 9. Documentation and compatibility

Update the package README, root README, PRD, normative architecture, operations, product slice, research record, CHANGELOG, package description, package-content contract, and repository contract test.

The new capability and Hover response shape become compatibility contracts. Breaking changes require explicit versioning and migration guidance. Packages remain `0.0.0` under `Unreleased`; this slice does not publish a release.

## 10. References

Microsoft. (2026). *Language Server Protocol specification 3.18*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (2026). *Class diagram syntax and features*. https://plantuml.com/class-diagram

PlantUML. (2026). *Component diagram syntax and features*. https://plantuml.com/component-diagram

PlantUML. (2026). *Sequence diagram syntax and features*. https://plantuml.com/sequence-diagram
