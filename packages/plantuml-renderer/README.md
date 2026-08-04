# `@contextualwisdomlab/diagramweave-plantuml-renderer`

Sandboxed, stdin-only local PlantUML rendering for DiagramWeave hosts.

```js
import {
  createPlantUmlRenderer,
  plantUmlRendererLimits,
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

See the repository operations guide for limits, error codes, licensing, and deployment requirements.
