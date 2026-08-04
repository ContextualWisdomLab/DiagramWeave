# `@contextualwisdomlab/diagramweave-plantuml-renderer`

Sandboxed, stdin-only local PlantUML rendering for DiagramWeave hosts.

```js
import {
  createPlantUmlRenderer,
  parsePlantUmlStandardReport,
  plantUmlRendererLimits,
  sanitizePlantUmlDiagnostics,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

console.log(plantUmlRendererLimits.timeoutMs.default); // 15000

const renderer = createPlantUmlRenderer({
  javaPath: '/absolute/path/to/java',
  jarPath: '/absolute/path/to/plantuml.jar',
});

const artifact = await renderer.render({
  source: '@startuml\nAlice -> Bob: hello\n@enduml\n',
  format: 'svg',
});
```

The package does not bundle Java or PlantUML. It requires absolute host-supplied paths, invokes no shell, uses an empty environment, passes source only through stdin, forces PlantUML `SANDBOX`, keeps local and remote includes unavailable, disables generated source metadata, performs fail-fast syntax checking, caps source/stdout/stderr, enforces a deadline, validates one SVG or PNG stream, and returns an immutable base64 artifact.

`plantUmlRendererLimits` is the frozen authoritative contract for every default, inclusive minimum, and inclusive maximum. Hosts can use it for configuration validation without copying numeric constants.

spawnImpl is a test-only process seam. It supports this package's deterministic process-boundary tests and is not a production extension point. Production hosts must omit `spawnImpl` so the package uses Node.js `spawn` with the fixed command contract.

## Structured diagnostics

The renderer parses PlantUML's bounded `-stdrpt:1` output with `parsePlantUmlStandardReport`. A located syntax error becomes one deeply frozen Language Server Protocol-compatible diagnostic:

```json
{
  "range": {
    "start": { "line": 1, "character": 0 },
    "end": { "line": 1, "character": 0 }
  },
  "severity": 1,
  "code": "plantuml.syntax",
  "source": "plantuml",
  "message": "PlantUML reported a syntax error.",
  "data": { "plantUmlLineNumber": 2 }
}
```

PlantUML reports one-based line numbers; the `range` uses zero-based LSP positions. PlantUML does not supply a character range, so the diagnostic uses a zero-width range at character zero. An error without a valid line remains a renderer failure but carries no fabricated diagnostic.

`sanitizePlantUmlDiagnostics` clones and validates diagnostics crossing package, worker, CLI, service, Studio, Language Server, or naruon boundaries. Raw stderr, raw labels, source excerpts, Java paths, JAR paths, credentials, and arbitrary provider messages are never exposed. Unknown and narrative report lines are ignored; malformed known fields and invalid UTF-8 fail closed.

See the repository operations guide for limits, error codes, licensing, deployment requirements, and the full diagnostic privacy boundary.
