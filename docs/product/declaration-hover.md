# Evidence-bounded declaration hover product slice

## Buyer problem

DiagramWeave can diagnose, outline, complete, and fold local PlantUML source, but a user who encounters an unfamiliar declaration still has to leave the editor or infer the declaration family from syntax. The friction is most visible to technical PMs, business analysts, reviewers, and occasional PlantUML authors working in large nested architecture documents.

The Language Server already owns conservative evidence for every explicit declaration it recognizes: the fixed declaration kind, displayed label, exact UTF-16 selection range, and immediate proven package or namespace container. The product should expose that evidence through the standard editor hover flow rather than adding another parser or asking a model to invent an explanation.

## Product outcome

A client that negotiates the Language Server Protocol 3.18 `textDocument.hover` capability can request `textDocument/hover` over an explicit declaration label and receive deterministic local evidence.

```plantuml
package Platform {
  namespace api {
    abstract class "API Gateway" as Gateway
  }
}
```

A hover inside `API Gateway` returns:

```text
PlantUML abstract class declaration
Name: API Gateway
Container: api
```

The result points back to the exact authoritative label range. A request over a keyword, relation, member, directive, comment, malformed declaration, brace, or ordinary whitespace returns `null`.

## Users and jobs

### Software and solution architect

Confirm the kind and grouping context of an explicit declaration without leaving the source review flow.

### Platform and infrastructure engineer

Inspect large deployment and component sources while preserving local, offline, source-controlled workflows.

### Technical PM and business analyst

Understand unfamiliar PlantUML declarations without depending on memorized syntax or an external model.

### Developer-experience owner

Provide the same hover contract to DiagramWeave Studio, IDE extensions, `dweave-lsp`, naruon, and other CWL hosts without host-specific parsing.

### Enterprise security administrator

Retain source locally and prevent an editor interaction from invoking a model, renderer, file reader, include processor, macro processor, shell, workspace index, or network service.

## Functional requirements

| ID | Requirement |
|---|---|
| HOVER-001 | Advertise `hoverProvider: true` only for a valid plain `capabilities.textDocument.hover` record. |
| HOVER-002 | Default to `plaintext` when `contentFormat` is absent. |
| HOVER-003 | Select the first supported `markdown` or `plaintext` entry from a bounded ordered `contentFormat` list. |
| HOVER-004 | Return `method_not_found` when hover was not negotiated. |
| HOVER-005 | Match only the exact `selectionRange` of an explicit declaration in the authoritative document-symbol tree. |
| HOVER-006 | Treat the selection start as inclusive and the selection end as exclusive. |
| HOVER-007 | Include the fixed PlantUML declaration detail and displayed name. |
| HOVER-008 | Include only the immediate proven package or namespace container when present. |
| HOVER-009 | Return the authoritative frozen selection range with the hover. |
| HOVER-010 | Return `null` for every valid position without an exact declaration-label match. |
| HOVER-011 | Fence Markdown with a delimiter longer than every dynamic backtick run. |
| HOVER-012 | Preserve UTF-16 positions across multilingual labels, emoji, LF, CRLF, and CR. |
| HOVER-013 | Walk deep symbol hierarchies iteratively without recursive product traversal. |
| HOVER-014 | Deeply freeze public hover, content, range, and position records. |
| HOVER-015 | Preserve accepted-snapshot, lifecycle, stale-mutation, diagnostics, symbols, completion, folding, and stdio behavior. |
| HOVER-016 | Fail closed for malformed, array-valued, proxied, revoked, throwing, oversized, or unsupported capabilities. |
| HOVER-017 | Perform no LLM, renderer, file, include, macro, shell, workspace, or network work. |

## Capability negotiation

A plain hover capability enables the feature:

```json
{
  "capabilities": {
    "textDocument": {
      "hover": {
        "contentFormat": ["markdown", "plaintext"]
      }
    }
  }
}
```

The optional list is limited to 16 entries. Every entry must be a string. The server honors client preference order and selects the first supported kind. The following states fail closed and do not advertise hover:

- missing or non-plain capability paths;
- array-valued or primitive hover records;
- an empty or oversized `contentFormat` list;
- a non-string list entry;
- a list containing no supported kind;
- proxied, revoked, or throwing capability data.

## Matching behavior

The feature uses the existing authoritative `DocumentSymbol[]` tree. It does not scan source independently.

A match exists only when:

1. the document is open and the requested position is valid for its latest accepted source;
2. the symbol was created from one explicit high-signal PlantUML declaration;
3. the position lies on the same line as the symbol selection;
4. the UTF-16 character is greater than or equal to the selection start;
5. the UTF-16 character is strictly less than the selection end.

The same source-order tree supplies the immediate container name. Only package and namespace symbols can own children under the current conservative hierarchy contract, so hover never fabricates a container from indentation or visual proximity.

## Plaintext response

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

A root declaration omits the `Container` line.

## Markdown response

Markdown contains the same evidence in a fenced `text` block. The fence length is at least three backticks and one longer than the longest contiguous backtick run in the dynamic text.

```markdown
```text
PlantUML class declaration
Name: Gateway
Container: api
```
```

A declaration label therefore cannot terminate the block or inject headings, links, HTML, images, or other Markdown structure.

## Accessibility

Hover is an enhancement, not the only access path to declaration information. A host should retain:

- the visible source label;
- keyboard navigation to the declaration;
- document outline access;
- a keyboard command or focus route that can request equivalent hover content;
- non-hover fallback behavior when the capability is absent;
- screen-reader announcement of exact text and range context.

The protocol result does not encode meaning by color, pointer location, animation, or iconography.

## Security and privacy

- Source remains in process memory and is not persisted by the Language Server.
- Document URIs are validated identifiers and are never dereferenced.
- Dynamic response data is limited to the displayed declaration label and immediate proven grouping container already visible in source.
- Markdown fencing prevents dynamic labels from altering presentation structure.
- Public errors contain no source, symbol name, rejected URI, capability value, renderer path, host exception, or raw diagnostic.
- The feature is deterministic, offline, and provider-neutral.
- Renderer sandboxing, include restrictions, and source-size limits remain unchanged.

## Quality and acceptance

- root, nested, aliased, abstract, multilingual, emoji, newline, and deep-tree fixtures pass;
- exact inclusive-start and exclusive-end boundary fixtures pass;
- relation, member, directive, comment, malformed-source, and non-label positions return `null`;
- plaintext and Markdown preference order is preserved;
- hostile and oversized capability and request data fails closed;
- lifecycle, rejected-mutation, stale-completion, and close-race tests pass;
- real bounded stdio round trips pass;
- existing diagnostics, symbol, compatibility, completion, folding, transport, package, and repository contracts stay green;
- production line, branch, and function coverage remains 100%;
- production JSDoc coverage remains 100%;
- no skipped, ignored, todo, or expected-failure test is accepted;
- Node.js 22 and 24, package dry runs, SAST, Security Scan, CodeRabbit, and review gates pass on one exact head.

## Product Design and Figma boundary

This backend slice exposes a standard Language Server response and does not add a custom DiagramWeave Studio visual component. It does not require a new Figma artifact.

Product Design and Figma become mandatory when Studio adds any of the following:

- a custom hover card;
- pinned or persistent hover content;
- focusable links or controls;
- disclosure or expand/collapse state;
- documentation links;
- custom keyboard interactions;
- side-by-side or visual comparison.

## Non-goals

- relation-endpoint hover;
- method, field, or member documentation;
- renderer-derived semantics;
- include or macro resolution;
- cross-document lookup;
- definition, references, rename, or workspace indexing;
- hover-triggered AI explanation;
- Studio UI redesign;
- release or version change while packages remain `0.0.0` under `Unreleased`.

## Success signal

A modern editor, `dweave-lsp`, DiagramWeave Studio, naruon, or another CWL host can explain a proven explicit declaration at its exact source label without reparsing source, contacting a service, invoking the renderer, or observing a different hierarchy than the document outline and folding features.
