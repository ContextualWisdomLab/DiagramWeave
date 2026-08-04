# Operating the Local PlantUML Renderer

## Scope

`@contextualwisdomlab/diagramweave-plantuml-renderer` turns one bounded PlantUML source string into an SVG or PNG artifact without writing source or output files. It is a reusable local boundary for DiagramWeave Studio, the future CLI and Language Server, naruon, and other CWL hosts.

The package does **not** download or bundle Java, PlantUML, Graphviz, fonts, or a renderer service. The operator supplies absolute Java and PlantUML JAR paths and owns installation, patching, license review, attribution, and platform support.

## Security profile

Every render uses this fixed command shape:

```text
<absolute-java>
-DPLANTUML_SECURITY_PROFILE=SANDBOX
-jar <absolute-plantuml-jar>
-charset UTF-8
-nometadata
-stdrpt:1
-t<svg|png>
-pipe
```

The command is passed as an argument array with `shell: false`. Source is written only to stdin. The child receives an empty environment, runs in the JAR directory, and receives no repository, model, or provider credentials.

PlantUML's official security documentation defines `SANDBOX` as the profile that blocks local file and URL access. DiagramWeave does not weaken that profile with an allowlist in this package. A future workspace-include feature requires a separate reviewed policy and process boundary rather than silently changing this renderer.

## Metadata privacy

PlantUML can embed source metadata in generated PNG and SVG files. DiagramWeave always adds `-nometadata` so an exported artifact does not become an unintended copy of the source. The host remains responsible for other sensitive information visibly rendered into the diagram.

## Construction

```js
import {
  createPlantUmlRenderer,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

const renderer = createPlantUmlRenderer({
  javaPath: '/opt/jdk/bin/java',
  jarPath: '/opt/plantuml/plantuml.jar',
  timeoutMs: 15_000,
  maxSourceBytes: 1_048_576,
  maxOutputBytes: 16_777_216,
  maxDiagnosticBytes: 65_536,
});
```

`javaPath` and `jarPath` must be absolute. Surrounding whitespace, control characters, relative paths, unbounded limits, and non-callable process adapters fail during construction.

Default limits:

| Limit | Default | Allowed range |
|---|---:|---:|
| deadline | 15 seconds | 10 ms–120 seconds |
| source | 1 MiB UTF-8 | 1 byte–16 MiB |
| output | 16 MiB | 1 byte–64 MiB |
| diagnostics | 64 KiB | 1 byte–1 MiB |

## Rendering

```js
const artifact = await renderer.render({
  source: '@startuml\nAlice -> Bob: hello\n@enduml\n',
  format: 'svg',
});
```

`format` is `svg` by default and also accepts `png`. The returned frozen object is JSON-serializable:

```text
format
mediaType
encoding = base64
dataBase64
byteLength
sourceRevisionHash
```

Base64 prevents a caller from mutating a shared Buffer and permits the same contract to cross a Worker, local process, or service boundary. A host may decode a private copy for display or file export.

## Output validation

The renderer accepts only:

- one UTF-8 SVG document with one `<svg>` root and no trailing payload; or
- one PNG stream with the PNG signature, terminal `IEND`, and no second PNG signature.

A successful child exit with empty, malformed, truncated, concatenated, or wrong-format output fails closed as `renderer_output_invalid`.

## Error contract

| Code | Meaning | Safe host response |
|---|---|---|
| `invalid_renderer_options` | Unsafe path, limit, or process adapter | Correct local configuration |
| `invalid_render_request` | Invalid source, NUL, size, or format | Correct the local request |
| `renderer_unavailable` | Spawn or stdin boundary failed | Verify Java and JAR installation |
| `renderer_timeout` | Deadline elapsed | Continue editing; offer an explicit retry |
| `renderer_output_too_large` | stdout or stderr exceeded its cap | Reduce diagram complexity or raise a reviewed limit |
| `renderer_failed` | PlantUML exited nonzero or by signal | Show a generic render failure; obtain structured diagnostics separately |
| `renderer_output_invalid` | Output does not match SVG/PNG contract | Verify PlantUML compatibility and installation |

Errors may expose `field`, `stream`, `exitCode`, or `signal`. They never expose source, raw stderr, Java/JAR paths, or environment values.

## Licensing and distribution

PlantUML's official FAQ describes multiple distribution variants and different license obligations. DiagramWeave deliberately ships no PlantUML binary in this slice. Before an installer or appliance bundles one, the release process must:

1. select the exact PlantUML artifact and license variant;
2. preserve required copyright and license notices;
3. record the artifact hash and version;
4. verify redistribution and modification obligations with legal review;
5. include the license in SBOM, provenance, installer, and source-offer processes where applicable;
6. test the exact bundled artifact against renderer contract fixtures.

## Operational limitations

- The package validates one artifact stream, not multiplexed `-pipe` output for multiple diagrams.
- It intentionally has no local include mode under `SANDBOX`.
- It does not parse PlantUML stderr into user-facing line diagnostics yet.
- It does not manage Graphviz discovery or font installation.
- It does not provide durable caching, file export, CLI argument parsing, or Studio preview state.

These belong to separate bounded components so the security boundary remains reviewable.
