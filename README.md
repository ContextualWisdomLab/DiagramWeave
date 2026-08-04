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

## Product direction

The repository is the modular foundation for:

- **DiagramWeave Studio:** manual source editor, preview, diagnostics, Context Inspector, diff review, recovery, and accessible approval flows;
- **DiagramWeave Renderer:** isolated local PlantUML rendering with `SANDBOX` security and remote includes disabled by default;
- **DiagramWeave Language Server:** diagnostics and navigation reusable by Studio and external IDEs;
- **DiagramWeave CLI:** deterministic validation, rendering, formatting, and CI policy checks;
- **naruon and CWL integration:** embeddable Core and provider adapters without requiring the Studio application.

The detailed product contract is in [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md). Component boundaries and trust decisions are in [`docs/architecture.md`](docs/architecture.md) and [`docs/security-model.md`](docs/security-model.md).

## Trust model

1. Source files are authoritative.
2. The host chooses and displays context sent to an LLM.
3. The LLM returns an edit proposal, never an implicit mutation.
4. The proposal references the exact SHA-256 source revision.
5. Schema, range, replacement, and scope expansion are validated locally.
6. Expanded edits require an explicit reason and host approval.
7. The user remains responsible for accepting, rejecting, saving, and committing changes.

## Development

DiagramWeave requires Node.js 22 or 24.

```bash
npm ci
npm run verify
```

`npm run verify` enforces syntax, behavior, production line/branch/function coverage at 100%, and production JSDoc coverage. The foundation has no third-party runtime dependencies.

## Documentation

- [Product requirements](docs/product/diagramweave-prd.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Contextual Orchestrator operations](docs/operations/contextual-orchestrator.md)
- [Security reporting](SECURITY.md)
- [Change history](CHANGELOG.md)

## Release status

No product release has been published. Version `0.0.0` represents an unreleased foundation. A version bump and release require an integrated, reviewed release candidate, updated `CHANGELOG.md`, cross-platform evidence, package verification, and repository policy compliance.
