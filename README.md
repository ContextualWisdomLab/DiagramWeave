# DiagramWeave

DiagramWeave is a source-first, AI-native editor platform for PlantUML and future text diagram languages. Manual editing remains authoritative and fully usable without an account, network connection, or LLM. Model output is treated as an untrusted, revision-bound proposal that must pass local validation and explicit review before application.

## Foundation packages

### `@contextualwisdomlab/diagramweave-core`

A zero-dependency trust kernel for deterministic revisions and safe source patches:

```js
import {
  hashSource,
  previewEditProposal,
} from '@contextualwisdomlab/diagramweave-core';

const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';
const proposal = {
  schemaVersion: '1.0',
  proposalId: 'proposal_alpha',
  documentId: 'diagram_document_alpha',
  baseRevisionHash: hashSource(source),
  operationType: 'modify_selection',
  requestedScope: { start: 24, end: 29 },
  effectiveScope: { start: 24, end: 29 },
  replacement: 'goodbye',
  summary: 'Replace the message label.',
  assumptions: ['The selected range is the intended label.'],
};

const preview = previewEditProposal(source, proposal);
console.log(preview.nextSource);
```

Core never reads files, calls a model, renders a diagram, writes a database, or applies hidden mutations.

### `@contextualwisdomlab/diagramweave-contextual-orchestrator`

The default remote adapter for [Contextual Orchestrator](https://github.com/ContextualWisdomLab/contextual-orchestrator):

```js
import {
  createContextualOrchestratorClient,
} from '@contextualwisdomlab/diagramweave-contextual-orchestrator';

const client = createContextualOrchestratorClient({
  baseUrl: 'https://orchestrator.example.com',
  token: await hostKeychain.read('diagramweave_orchestrator_token'),
});

const proposal = await client.requestEditProposal({
  documentId: 'diagram_document_alpha',
  source,
  operationType: 'modify_selection',
  requestedScope: { start: 24, end: 29 },
  instruction: 'Change the selected label to goodbye.',
});
```

The adapter permits remote HTTPS and loopback-only HTTP, bounds context, sends no files or environment variables automatically, rejects provider error bodies, parses strict assistant JSON, and returns only Core-validated proposals. It never saves or applies the returned edit.

### `@contextualwisdomlab/diagramweave-plantuml-renderer`

A local, sandboxed renderer that receives PlantUML only through stdin and returns a bounded, immutable SVG or PNG artifact:

```js
import {
  createPlantUmlRenderer,
  parsePlantUmlStandardReport,
  plantUmlRendererLimits,
  sanitizePlantUmlDiagnostics,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

const renderer = createPlantUmlRenderer({
  javaPath: '/absolute/path/to/java',
  jarPath: '/absolute/path/to/plantuml.jar',
});

const artifact = await renderer.render({
  source,
  format: 'svg',
});

const svg = Buffer.from(artifact.dataBase64, 'base64').toString('utf8');
```

`plantUmlRendererLimits` exposes the frozen default and supported range contract for host configuration. The renderer requires host-supplied absolute Java and JAR paths. It invokes no shell, passes an empty child environment, enables PlantUML `SANDBOX`, disables source metadata, enforces fail-fast syntax checking plus source/output/diagnostic/deadline limits, validates the output structure, and never exposes raw stderr or raw PlantUML labels.

`parsePlantUmlStandardReport` converts bounded `-stdrpt:1` output into deeply frozen, LSP-compatible line diagnostics. `sanitizePlantUmlDiagnostics` revalidates and clones those records before they cross package, worker, service, CLI, Studio, Language Server, or naruon boundaries. Only fixed product messages, bounded lines, a zero-width range, severity `1`, and code `plantuml.syntax` are exposed.

DiagramWeave does not bundle or download PlantUML in this foundation, so distributors must choose a compatible PlantUML artifact and satisfy its license notices separately.

### `@contextualwisdomlab/diagramweave-cli`

A deterministic manual and CI surface for validating or rendering one PlantUML file or an entire directory without an LLM:

```bash
dweave validate ./diagrams --java /absolute/path/to/java --jar /absolute/path/to/plantuml.jar
dweave render ./diagrams --output ./artifacts --java /absolute/path/to/java --jar /absolute/path/to/plantuml.jar
```

The CLI discovers `.puml` and `.plantuml` files in stable lexical order, rejects symbolic links and output collisions, writes artifacts exclusively or by explicit atomic replacement, and emits source-free human or JSON reports. Located syntax failures include the safe relative path and PlantUML line while JSON retains the LSP-compatible zero-based range. The CLI validates and clones renderer diagnostics instead of trusting an arbitrary thrown object.

The package is independently reusable by naruon, CI, and other CWL hosts. See [`packages/cli/README.md`](packages/cli/README.md) for the complete command, diagnostic, exit-code, filesystem, and embedding contracts.

### `@contextualwisdomlab/diagramweave-language-server`

A transport-neutral LSP 3.18 session for local PlantUML diagnostics,
capability-negotiated document outlines, deterministic declaration completion,
and conservative folding ranges:

```js
import {
  createLanguageServerSession,
} from '@contextualwisdomlab/diagramweave-language-server';

const session = createLanguageServerSession({
  javaPath: '/absolute/path/to/java',
  jarPath: '/absolute/path/to/plantuml.jar',
  publishNotification(method, params) {
    host.sendNotification(method, params);
  },
});

await session.request('initialize', {
  capabilities: {
    textDocument: {
      documentSymbol: {
        hierarchicalDocumentSymbolSupport: true,
      },
      completion: {},
      foldingRange: {
        rangeLimit: 1024,
        lineFoldingOnly: true,
      },
    },
  },
});
```

The session uses full-document synchronization, local file-URI identifiers,
source-free renderer diagnostics, exact version/generation checks,
capability-negotiated `textDocument/documentSymbol`, capability-gated
`textDocument/completion`, and capability-gated `textDocument/foldingRange`. Clients that explicitly advertise
`hierarchicalDocumentSymbolSupport: true` receive the bounded immutable
`DocumentSymbol[]` tree. Other clients receive source-order
`SymbolInformation[]` from the same authoritative tree, with the validated local
URI, enclosing range, and immediate `containerName` when ownership was proven.

The outline recognizes high-signal explicit PlantUML declarations and adds
`children` only for complete unquoted package or namespace brace scopes with
stack-ordered, indentation-matched standalone closers. Ambiguous, unmatched,
quoted, commented, macro, include, and renderer-dependent structure remains
flat. Completion filters the same declaration families from a fixed local
catalog and returns exact UTF-16 text edits only at safe line-leading prefixes.
It performs no LLM, renderer, file, include, macro, workspace, or network work.

Folding advertises `foldingRangeProvider: true` only when the client supplies a
valid plain `textDocument.foldingRange` capability. It reuses the same
authoritative document-symbol tree, honors `rangeLimit` up to the 1,024-symbol
ceiling, accepts boolean `lineFoldingOnly`, and returns immutable source-order
package and namespace ranges without a second parser.
Studio, IDE extensions, naruon, and other CWL hosts reuse this package without
importing a process transport.

### `@contextualwisdomlab/diagramweave-language-server-stdio`

A bounded JSON-RPC stdio adapter and `dweave-lsp` executable for standard IDE
integration:

```bash
DIAGRAMWEAVE_JAVA_PATH=/absolute/path/to/java \
DIAGRAMWEAVE_PLANTUML_JAR_PATH=/absolute/path/to/plantuml.jar \
dweave-lsp
```

The adapter validates ASCII Content-Length framing and UTF-8 JSON-RPC 2.0,
serializes input and output, bounds messages and queues, and returns exit code
zero only after successful shutdown followed by exit. It imports the same
transport-neutral session, so diagnostics, negotiated document symbols,
declaration completion, and conservative folding ranges do not diverge between
embedded and process-based hosts.
Invalid completion positions are returned as fixed JSON-RPC Invalid params
responses without source or URI values.

## Product direction

The repository is the modular foundation for:

- **DiagramWeave Studio:** manual source editor, preview, diagnostics, hierarchical outline, completion, Context Inspector, diff review, recovery, and accessible approval flows;
- **DiagramWeave Renderer:** implemented local PlantUML package with stdin-only rendering, `SANDBOX`, metadata suppression, bounded resources, safe line diagnostics, and local and remote includes unavailable;
- **DiagramWeave Language Server:** implemented diagnostics, capability-negotiated hierarchical or legacy-flat document outlines, deterministic declaration completion, conservative package and namespace folding ranges, and bounded stdio integration reusable by Studio and external IDEs;
- **DiagramWeave CLI:** implemented deterministic validation, rendering, atomic publication, and structured diagnostic foundation, with formatting and policy checks remaining future work;
- **naruon and CWL integration:** embeddable Core, renderer, diagnostics, CLI, Language Server, stdio transport, and provider adapters without requiring the Studio application.

The detailed product contract is in [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md). Component boundaries and trust decisions are in [`docs/architecture.md`](docs/architecture.md) and [`docs/security-model.md`](docs/security-model.md).

## Trust model

1. Source files are authoritative.
2. The host chooses and displays context sent to an LLM.
3. The LLM returns an edit proposal, never an implicit mutation.
4. The proposal references the exact SHA-256 source revision.
5. Schema, range, replacement, and scope expansion are validated locally.
6. Expanded edits require an explicit reason and host approval.
7. Raw child output remains inside the renderer boundary; hosts receive only bounded, fixed-message diagnostics.
8. Outline and completion records are derived only from sanitized accepted open-document snapshots and are never inferred from remote content.
9. Outline hierarchy requires complete stack-ordered package or namespace braces with matching indentation; ambiguous or malformed structure remains flat.
10. Non-hierarchical clients receive immutable `SymbolInformation[]` from the same authoritative symbol tree rather than a second parser.
11. Declaration completion fails by omission in comments, strings, relations, directives, completed declarations, and ambiguous cursor positions.
12. Folding ranges are derived only from complete nonempty package or namespace scopes in the same authoritative symbol tree; ambiguous structure produces no fold.
13. The user remains responsible for accepting, rejecting, saving, and committing changes.

## Development

DiagramWeave requires Node.js 22 or 24.

```bash
npm ci
npm run verify
```

`npm run verify` enforces syntax, behavior, production line/branch/function coverage at 100%, and production JSDoc coverage. Runtime code uses Node.js built-ins and independently reusable DiagramWeave workspace packages.

## Documentation

- [Product requirements](docs/product/diagramweave-prd.md)
- [Declaration-completion product slice](docs/product/declaration-completion.md)
- [Hierarchical-outline product slice](docs/product/hierarchical-document-outline.md)
- [Document-symbol compatibility product slice](docs/product/document-symbol-compatibility.md)
- [Conservative folding-ranges product slice](docs/product/folding-ranges.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Structured diagnostics research](docs/research/plantuml-structured-diagnostics.md)
- [PlantUML document-symbol research](docs/research/plantuml-document-symbols.md)
- [PlantUML declaration-completion research](docs/research/plantuml-declaration-completion.md)
- [PlantUML hierarchical-symbol research](docs/research/plantuml-hierarchical-document-symbols.md)
- [LSP document-symbol compatibility research](docs/research/lsp-document-symbol-compatibility.md)
- [PlantUML folding-ranges research](docs/research/plantuml-folding-ranges.md)
- [Contextual Orchestrator operations](docs/operations/contextual-orchestrator.md)
- [PlantUML renderer operations](docs/operations/plantuml-renderer.md)
- [Document-symbol operations](docs/operations/document-symbols.md)
- [Declaration-completion operations](docs/operations/declaration-completion.md)
- [Hierarchical document-symbol operations](docs/operations/hierarchical-document-symbols.md)
- [Document-symbol compatibility operations](docs/operations/document-symbol-compatibility.md)
- [Folding-ranges operations](docs/operations/folding-ranges.md)
- [DiagramWeave Language Server](packages/language-server/README.md)
- [DiagramWeave stdio Language Server](packages/language-server-stdio/README.md)
- [DiagramWeave CLI](packages/cli/README.md)
- [Security reporting](SECURITY.md)
- [Change history](CHANGELOG.md)

## Release status

No product release has been published. Version `0.0.0` represents an unreleased foundation. A version bump and release require an integrated, reviewed release candidate, updated `CHANGELOG.md`, cross-platform evidence, package verification, and repository policy compliance.
