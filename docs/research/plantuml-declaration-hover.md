# PlantUML declaration hover research

## Research question

How can DiagramWeave expose useful declaration information through Language Server Protocol hover without introducing a second PlantUML parser, renderer-dependent semantics, model inference, remote data transfer, or disagreement with the document outline?

## Conclusion

Use the Language Server Protocol 3.18 `textDocument/hover` request as a presentation layer over DiagramWeave's authoritative document-symbol tree.

A hover is available only for the exact UTF-16 `selectionRange` of an explicit declaration already recognized by the conservative scanner. The response contains the scanner's fixed declaration detail, displayed label, and immediate proven package or namespace container. Valid non-matching positions return `null`.

This approach is standards-compatible, deterministic, local, bounded, and composable. It does not claim semantic knowledge beyond the evidence already used by document symbols and folding ranges.

## Normative protocol evidence

### Capability negotiation

Language Server Protocol 3.18 defines `HoverClientCapabilities` under `textDocument.hover`. The optional `contentFormat` property is an ordered array of MarkupKind values describing the formats the client supports. Servers should respect the order as the client's preference.

DiagramWeave implements a deliberately bounded subset:

- a plain hover capability is required;
- absent `contentFormat` defaults to `plaintext`;
- a present list is limited to 16 string entries;
- supported values are exactly `markdown` and `plaintext`;
- the first supported entry wins;
- malformed or unsupported capability data fails closed.

The server advertises the standard `hoverProvider: true` capability only when this negotiation succeeds.

### Request parameters

`textDocument/hover` uses `TextDocumentPositionParams`: a text-document identifier and a position. LSP positions are zero-based and use the negotiated position encoding. DiagramWeave's Language Server advertises UTF-16, so every hover boundary is measured in JavaScript UTF-16 code units rather than UTF-8 bytes, Unicode scalar values, or grapheme clusters.

DiagramWeave validates the requested line and character against the latest accepted full-document snapshot before matching a declaration.

### Response

The protocol returns `Hover | null`. `Hover` contains:

- `contents`, represented here as `MarkupContent`;
- an optional `range` identifying the source span relevant to the hover.

DiagramWeave returns `null` for a valid position without authoritative declaration evidence. On a match, it returns the same deeply frozen selection range already produced for the document symbol.

### MarkupKind

LSP MarkupKind supports `plaintext` and `markdown`. DiagramWeave does not return legacy `MarkedString` values. A single MarkupContent shape makes embedded and stdio hosts consistent and avoids deprecated presentation variants.

## PlantUML source evidence

PlantUML's official documentation describes explicit declarations across several diagram families. Examples include:

- class, abstract class, interface, enum, annotation, entity, and object declarations;
- package and namespace grouping declarations;
- participant, actor, boundary, control, database, collections, and queue declarations;
- component, node, cloud, frame, folder, artifact, file, stack, storage, card, agent, rectangle, use case, and state declarations;
- quoted or delimited display labels and `as` aliases.

DiagramWeave already recognizes a conservative documented subset of these declaration families in `documentSymbolsForSource`. The scanner chooses one displayed label, maps the declaration keyword to a fixed LSP SymbolKind, preserves exact UTF-16 selection coordinates, and creates hierarchy only for complete package or namespace brace scopes proven by stack order and matching indentation.

Hover reuses those records. It does not reinterpret PlantUML source independently.

## Authoritative-tree reuse

The existing symbol tree provides:

```text
name
fixed declaration detail
LSP symbol kind
enclosing source range
exact selection range
optional proven children
```

A nonrecursive source-preorder traversal carries the immediate parent's name while inspecting each symbol. Because only complete package and namespace scopes can own children under the current scanner contract, the inherited parent name is a proven grouping container rather than an indentation guess.

The response text is therefore limited to:

```text
PlantUML <detail> declaration
Name: <displayed name>
Container: <immediate proven grouping name>
```

The container line is omitted for root declarations.

## Why the whole declaration line is not matched

LSP hover may be requested at any valid position, but matching the entire declaration line would overstate evidence. Keywords, stereotypes, colors, braces, aliases, comments, and other suffix syntax can carry different or unsupported meanings.

DiagramWeave matches only the exact authoritative `selectionRange` of the displayed label. The selection start is inclusive and the end is exclusive. This produces a stable, narrow interaction contract shared with outline navigation.

## Why relation endpoints are omitted

A relation such as:

```plantuml
Gateway --> Database
```

may visually refer to explicit declarations, implicit participants, aliases, quoted identifiers, or names that are ambiguous across grouping scopes. Resolving it safely requires an identity index, alias rules, ambiguity handling, and potentially cross-document semantics.

Returning a declaration hover from substring equality would create false confidence. Relation-endpoint hover remains a non-goal until a bounded definition/references design provides authoritative identity evidence.

## Why members are omitted

Class members and methods have diagram-family-specific syntax, visibility markers, type annotations, generics, quoted text, and renderer-dependent variations. The current authoritative scanner does not create member symbols. Hover therefore returns `null` rather than parsing members in a new feature-specific grammar.

## Why renderer output is not used

PlantUML's renderer is an isolated local process boundary used for validation and SVG/PNG generation. Renderer output is not a stable semantic API for editor navigation. Using it for hover would:

- introduce process latency into an editor interaction;
- couple hover availability to Java and JAR configuration;
- risk exposing raw renderer labels or diagnostics;
- make embedded and offline hosts less predictable;
- permit outline and hover to disagree.

The renderer remains outside the hover path.

## Why an LLM is not used

A model could generate longer explanations, but it would weaken the product contract:

- output could vary across model, provider, prompt, and time;
- source might leave the local boundary;
- credentials and network availability would become hover dependencies;
- a model could infer unsupported semantics from relations or labels;
- latency and cost would affect basic editor navigation;
- evidence would no longer be exactly tied to the authoritative symbol record.

DiagramWeave may later offer an explicitly requested, revision-bound AI explanation in a separate user flow. Standard hover remains deterministic and model-free.

## Markdown threat model

Declaration and container names are source-derived, untrusted display data. A fixed triple-backtick fence is unsafe when a quoted PlantUML label contains three or more backticks, because the label could terminate the block and inject Markdown structure.

DiagramWeave calculates the longest contiguous backtick run in the complete plaintext hover value and chooses a fence one character longer, with a minimum length of three. It then places the value in a `text` code block.

This prevents dynamic labels from terminating the fence or creating headings, links, images, HTML blocks, or other Markdown elements. Hosts must still treat MarkupContent as untrusted source-derived presentation data.

## Hostile-boundary model

Capabilities and request parameters can be caller-owned JavaScript objects when the package is embedded. They may be:

- arrays where records are expected;
- null-prototype records;
- Proxy objects;
- revoked proxies;
- objects with throwing getters;
- arrays with trapped length or element access;
- oversized or sparse arrays;
- records containing invalid scalar types.

All capability access occurs inside a hostile boundary. Invalid capability data disables hover without dynamic error content. Request-envelope failures map to stable source-free LanguageServerError codes. The package copies accepted scalar values into frozen records and never retains caller-owned objects.

## Snapshot consistency

Hover is the outermost Language Server feature layer:

```text
hover
  -> folding
    -> completion
      -> document symbols
        -> diagnostics
```

The hover layer stores a source snapshot only after every inner layer accepts an open or full-document change. Epoch and sequence tracking prevents:

- a rejected newer mutation from replacing a valid snapshot;
- an old renderer completion from restoring stale source;
- a pending older mutation from winning while newer work is active;
- a close, shutdown, exit, or disposal from allowing source resurrection.

This repeats the proven composition contract rather than sharing mutable feature state across layers.

## Accessibility interpretation

Hover is not sufficient as the sole route to important information because pointer hover may be unavailable to keyboard, touch, speech, and assistive-technology users. The protocol feature must coexist with:

- visible source;
- document outline;
- keyboard-triggered hover commands supplied by the host;
- focus-preserving editor navigation;
- a no-hover fallback.

A custom Studio hover card would require a separate Product Design and Figma interaction contract. The backend protocol slice does not introduce one.

## Verification implications

The design requires executable evidence for:

- exact UTF-16 ranges over multilingual labels and emoji;
- LF, CRLF, and CR consistency;
- root and nested declarations;
- aliases and abstract classes;
- inclusive start and exclusive end;
- null behavior outside labels;
- non-terminable Markdown fencing;
- bounded client preference negotiation;
- hostile capabilities and request objects;
- lifecycle and stale-mutation races;
- deep iterative traversal;
- real JSON-RPC stdio serialization;
- unchanged diagnostics, symbols, compatibility, completion, and folding behavior;
- exact 100% production coverage and JSDoc.

## Limitations

This feature explains only the declaration evidence currently recognized by the scanner. It does not establish:

- whether a relation endpoint resolves to that declaration;
- whether a declaration is referenced elsewhere;
- whether an include or macro changes its meaning;
- member or method semantics;
- renderer-dependent behavior;
- workspace-wide identity;
- domain-specific architectural meaning.

These omissions are intentional safeguards, not hidden implementation gaps.

## References

Microsoft. (2026). *Language Server Protocol specification 3.18*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (2026). *Class diagram syntax and features*. https://plantuml.com/class-diagram

PlantUML. (2026). *Component diagram syntax and features*. https://plantuml.com/component-diagram

PlantUML. (2026). *Sequence diagram syntax and features*. https://plantuml.com/sequence-diagram
