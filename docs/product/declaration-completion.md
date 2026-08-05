# Deterministic PlantUML declaration completion

## Buyer-visible gap

Before this slice, DiagramWeave could validate, render, and outline PlantUML,
but a manual author still had to remember and type every declaration keyword.
Studio, IDE extensions, naruon, and other CWL hosts would otherwise implement
different local keyword lists and replacement rules, producing inconsistent
behavior and duplicated security boundaries.

This product slice adds one reusable, deterministic completion surface to the
transport-neutral Language Server and the real `dweave-lsp` stdio process.
Manual editing remains authoritative and the feature is fully available without
an account, network connection, renderer, or LLM.

## User outcome

At a line-leading PlantUML declaration prefix, the user receives stable keyword
candidates and an exact text edit. Examples include:

| Source before cursor | Candidates |
|---|---|
| `cl` | `class`, `cloud` |
| `par` | `participant` |
| `  com` | `component` |
| `abstra` | `abstract class` |
| `@sta` | `@startuml` |

The inserted edit replaces only the typed prefix and preserves indentation,
text after the cursor, unrelated lines, multilingual labels, and emoji.

## Product contract

### Included

- LSP 3.18 `textDocument/completion`;
- initialize-time completion capability negotiation;
- `completionProvider: { resolveProvider: false }` for supporting clients;
- a fixed catalog of diagram boundaries and explicit class, sequence,
  component, deployment, use-case, and state declaration keywords;
- case-insensitive filtering with canonical insertion text;
- deterministic ordering and immutable CompletionItems;
- exact UTF-16 text-edit ranges;
- comment, quote, relation, directive, completed-declaration, and mid-keyword
  suppression;
- bounded source, document, URI, and result contracts;
- full lifecycle and stale-mutation protection;
- real stdio JSON-RPC integration;
- shared use by Studio, IDEs, naruon, and other CWL products.

### Excluded

- member, attribute, method, stereotype, relation, alias, color, skinparam, or
  include completion;
- semantic names learned from the current workspace;
- snippets and placeholder navigation;
- `completionItem/resolve`;
- LLM-generated candidates;
- remote documentation lookup;
- renderer-assisted or macro-expanded suggestions;
- automatic application without the client accepting a text edit.

These exclusions preserve a narrow trustworthy contract. Richer completion
requires a separately versioned parser and evidence that it does not invent or
misplace edits.

## Acceptance criteria

1. A completion-capable client receives `completionProvider` during initialize.
2. A client that omits or hides the capability receives no completion
   advertisement.
3. Completion before initialize, before initialized, after shutdown, after exit,
   or after disposal fails with the established lifecycle codes.
4. Completion for an unopened or closed document fails without leaking the URI.
5. Accepted changes immediately update the completion source.
6. Rejected newer mutations do not erase an older valid source snapshot.
7. Older successful work cannot overwrite a newer accepted snapshot.
8. UTF-16 edit ranges remain exact after multilingual source and emoji.
9. Comments, strings, relations, directives, completed declarations, and
   mid-keyword cursor positions return no candidates.
10. Malformed positions map to JSON-RPC Invalid params over stdio.
11. All production line, branch, and function coverage remains 100%.
12. Every production module and public production symbol retains JSDoc.
13. Node.js 22 and 24 verification, SAST, security scan, CodeRabbit, and review
    threads pass on the same head before merge.

## Modular product fit

```text
DiagramWeave diagnostic session
  -> document-symbol session
    -> declaration-completion session
      -> embedded host or bounded stdio transport
```

Each layer owns only the state required for its capability. Completion does not
move source I/O, UI, process control, persistence, rendering, or provider access
into the Language Server package. The same package can run independently or as
a module inside Studio and naruon.

## Product telemetry boundary

The foundation emits no analytics. A future host may measure only explicit,
privacy-reviewed product events such as completion request count, non-empty
result count, selected keyword identifier, and request latency. It must not log
source lines, labels, URIs, document contents, or rejected hostile values.

## Studio and Figma handoff

The backend slice does not introduce a visual component. Before Studio exposes
completion, Product Design and Figma must define at least:

- keyboard opening, filtering, selection, acceptance, cancellation, and focus
  return;
- screen-reader relationship between the editor cursor, listbox, option count,
  and selected item;
- empty, loading, unavailable, conflict, and stale-response states;
- high-contrast and reduced-motion behavior;
- narrow-window and magnification layouts;
- coexistence with diagnostics and document-symbol navigation;
- an exact-value fallback that does not depend on hover or pointer input.

Implementation must use the LSP-provided text edit rather than reconstructing a
range in the UI.

## Release status

This is an unreleased foundation capability under package version `0.0.0` and
`CHANGELOG.md` `Unreleased`. It is not by itself a release boundary. Studio,
cross-platform runtime evidence, packaging, signing, SBOM/provenance, rollback,
and commercial support evidence remain required before a product release.
