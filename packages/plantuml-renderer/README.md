# `@contextualwisdomlab/diagramweave-plantuml-renderer`

Sandboxed, stdin-only local PlantUML rendering for DiagramWeave hosts.

```js
import {
  createPlantUmlRenderer,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

const renderer = createPlantUmlRenderer({
  javaPath: '/absolute/path/to/java',
  jarPath: '/absolute/path/to/plantuml.jar',
});

const artifact = await renderer.render({
  source: '@startuml\nAlice -> Bob: hello\n@enduml\n',
  format: 'svg',
});
```

The package does not bundle Java or PlantUML. It requires absolute host-supplied paths, invokes no shell, uses an empty environment, passes source only through stdin, forces PlantUML `SANDBOX`, disables generated source metadata, performs fail-fast syntax checking, caps source/stdout/stderr, enforces a deadline, validates one SVG or PNG stream, and returns an immutable base64 artifact.

See the repository operations guide for limits, error codes, licensing, and deployment requirements.
