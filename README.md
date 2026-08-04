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

## Product direction

The repository is the modular foundation for:

- **DiagramWeave Studio:** manual source editor, preview, diagnostics, Context Inspector, diff review, recovery, and accessible approval flows;
- **DiagramWeave Renderer:** implemented local PlantUML package with stdin-only rendering, `SANDBOX`, metadata suppression, bounded resources, safe line diagnostics, and local and remote includes unavailable;
- **DiagramWeave Language Server:** diagnostics and navigation reusable by Studio and external IDEs, building on the implemented LSP-compatible renderer record;
- **DiagramWeave CLI:** implemented deterministic validation, rendering, atomic publication, and structured diagnostic foundation, with formatting and policy checks remaining future work;
- **naruon and CWL integration:** embeddable Core, renderer, diagnostics, CLI, and provider adapters without requiring the Studio application.

The detailed product contract is in [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md). Component boundaries and trust decisions are in [`docs/architecture.md`](docs/architecture.md) and [`docs/security-model.md`](docs/security-model.md).

## Trust model

1. Source files are authoritative.
2. The host chooses and displays context sent to an LLM.
3. The LLM returns an edit proposal, never an implicit mutation.
4. The proposal references the exact SHA-256 source revision.
5. Schema, range, replacement, and scope expansion are validated locally.
6. Expanded edits require an explicit reason and host approval.
7. Raw child output remains inside the renderer boundary; hosts receive only bounded, fixed-message diagnostics.
8. The user remains responsible for accepting, rejecting, saving, and committing changes.

## Development

DiagramWeave requires Node.js 22 or 24.

```bash
npm ci
npm run verify
```

`npm run verify` enforces syntax, behavior, production line/branch/function coverage at 100%, and production JSDoc coverage. Runtime code uses Node.js built-ins and independently reusable DiagramWeave workspace packages.

## Documentation

- [Product requirements](docs/product/diagramweave-prd.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Structured diagnostics research](docs/research/plantuml-structured-diagnostics.md)
- [Contextual Orchestrator operations](docs/operations/contextual-orchestrator.md)
- [PlantUML renderer operations](docs/operations/plantuml-renderer.md)
- [DiagramWeave CLI](packages/cli/README.md)
- [Security reporting](SECURITY.md)
- [Change history](CHANGELOG.md)

## Release status

No product release has been published. Version `0.0.0` represents an unreleased foundation. A version bump and release require an integrated, reviewed release candidate, updated `CHANGELOG.md`, cross-platform evidence, package verification, and repository policy compliance.
