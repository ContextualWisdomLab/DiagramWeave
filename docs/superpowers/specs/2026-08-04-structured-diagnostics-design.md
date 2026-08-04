# Structured PlantUML Diagnostics Design

## Goal

Expose bounded, source-free, line-addressable PlantUML diagnostics through the existing renderer and CLI contracts so Studio, the future Language Server, naruon, CI systems, and other CWL hosts can identify the failing source line without parsing child-process output themselves.

## Buyer-visible gap

`dweave validate` and `dweave render` currently report a stable `renderer_failed` code, but they do not tell the user which source line PlantUML rejected. The renderer already invokes PlantUML with `-stdrpt:1`; PlantUML's documented protocol emits `protocolVersion`, `status`, `lineNumber`, and `label` fields for syntax failures. The product currently reduces that bounded report to an `ok`, `error`, `unknown`, or `invalid` state and discards the safe location signal.

Users therefore have to rerun PlantUML manually or inspect raw stderr outside DiagramWeave. That weakens the CLI's value in local authoring, CI annotations, naruon tool responses, and future editor integrations.

## Approaches considered

### Recommended: parse at the renderer boundary

Add a pure parser inside `@contextualwisdomlab/diagramweave-plantuml-renderer`, return a safe immutable diagnostic record, attach it to `PlantUmlRendererError`, and let the CLI copy the record into its per-file result.

This keeps raw stderr inside the process boundary, gives every host one canonical interpretation, and avoids coupling the CLI to PlantUML process details.

### Rejected: parse in the CLI

The CLI could inspect renderer error text or receive raw diagnostics, but that would duplicate PlantUML protocol logic and expand the public exposure surface. Studio and the Language Server would then need their own parsers or depend on the CLI package.

### Deferred: create a separate diagnostics package

A provider-neutral diagnostics package may become useful when Mermaid, D2, Graphviz, and Structurizr adapters exist. Creating it now would add package and versioning overhead for one producer and one diagnostic shape. The renderer exports the pure parser so it can be extracted later without changing the public record.

## Standard-report parser

Create `packages/plantuml-renderer/src/diagnostics.js` with:

```js
parsePlantUmlStandardReport(diagnostics: Buffer): Readonly<{
  protocolVersion: number | null,
  status: 'ok' | 'error' | 'unknown' | 'invalid',
  diagnostic: Readonly<{
    schemaVersion: 1,
    source: 'plantuml',
    severity: 'error',
    code: 'plantuml_syntax_error' | 'plantuml_error',
    message: string,
    lineNumber: number | null,
    columnNumber: null
  }> | null
}>
```

The parser shall:

- decode once as fatal UTF-8;
- read only exact line-oriented `key=value` fields;
- recognize `protocolVersion`, `status`, `lineNumber`, and `label`;
- reject duplicate recognized keys;
- accept protocol version `1` when present and reject unsupported or malformed versions;
- accept `status=OK` or `status=ERROR` only;
- accept a decimal `lineNumber` from `1` through `2147483647`;
- ignore narrative lines and unknown fields without returning their contents;
- return `unknown` for an empty report or a report with no recognized status;
- return `invalid` for malformed recognized fields, contradictory fields, or invalid UTF-8;
- return no diagnostic for `ok`, `unknown`, or `invalid`;
- map the exact documented labels `Syntax Error` and `Syntax Error?` to `plantuml_syntax_error`;
- map every other label to `plantuml_error` without exposing the raw label;
- use `lineNumber: null` when an error report lacks a valid location;
- deeply freeze the result and diagnostic.

The parser does not return raw stderr, unknown fields, narrative lines, or the PlantUML label. This preserves the existing source-free error boundary even if a future PlantUML label echoes user content.

## Renderer contract

`createPlantUmlRenderer()` continues to treat `status=ERROR` and invalid standard reports as failures.

For a valid error report it raises:

```js
new PlantUmlRendererError(
  'renderer_failed',
  'PlantUML rejected the source or failed to render it.',
  {
    exitCode,
    signal,
    diagnostics: [safeDiagnostic]
  }
)
```

For an error without a report diagnostic, `diagnostics` is an empty frozen array. `PlantUmlRendererError` clones and freezes every diagnostic instead of retaining caller-owned objects.

Invalid UTF-8, duplicate fields, unsupported protocol versions, contradictory success/error fields, and malformed line numbers remain fail-closed `renderer_failed` results with no diagnostic.

## CLI contract

Every top-level report owns `diagnostics: []`. Every per-file result owns a deeply frozen `diagnostics` array.

- successful `valid` and `rendered` files use `diagnostics: []`;
- renderer failures copy only validated renderer diagnostics;
- input-read and output-publication failures use `diagnostics: []`;
- invocation failures use top-level `diagnostics: []` and no file results;
- the CLI never reparses PlantUML stderr or recomputes a location;
- unsafe or malformed diagnostic objects are discarded rather than copied.

This is an additive version-1 report extension, so `schemaVersion` remains `1`.

Canonical JSON file failure:

```json
{
  "relativePath": "flows/checkout.puml",
  "status": "failed",
  "sourceRevisionHash": null,
  "outputPath": null,
  "errorCode": "renderer_failed",
  "errorMessage": "PlantUML rejected the source or failed to render it.",
  "diagnostics": [
    {
      "schemaVersion": 1,
      "source": "plantuml",
      "severity": "error",
      "code": "plantuml_syntax_error",
      "message": "PlantUML reported a syntax error.",
      "lineNumber": 2,
      "columnNumber": null
    }
  ]
}
```

Human output adds one indented line per diagnostic after the file failure:

```text
FAIL flows/checkout.puml [renderer_failed] PlantUML rejected the source or failed to render it.
  flows/checkout.puml:2 ERROR [plantuml_syntax_error] PlantUML reported a syntax error.
```

A diagnostic with no line uses `flows/checkout.puml:?`.

## Error and privacy boundaries

- raw stderr never crosses the renderer package boundary;
- raw `label` values never cross the parser boundary;
- diagnostics contain no source excerpt, executable path, JAR path, credential, or arbitrary provider message;
- line numbers are bounded integers, not strings;
- diagnostic messages are fixed product strings;
- diagnostic arrays and records are deeply frozen;
- narrative lines that contain strings such as `status=ERROR` are not interpreted as fields unless the entire line is exactly a recognized key-value field;
- duplicate recognized keys fail closed to prevent field-shadowing ambiguity.

## Testing

Use TDD and preserve exact production line, branch, function, and JSDoc coverage at 100%.

The test corpus includes:

- the official PlantUML `-stdrpt:1` syntax-error example at line 2;
- CRLF and LF reports;
- successful reports containing narrative or labels with embedded `status=ERROR` text;
- unknown labels mapped to a generic code without label disclosure;
- missing line numbers;
- minimum and maximum accepted line numbers;
- zero, negative, overflow, non-decimal, duplicate, and contradictory fields;
- unsupported protocol versions;
- invalid UTF-8;
- renderer error propagation and deep immutability;
- CLI JSON propagation, empty diagnostic arrays for non-renderer failures, and malformed-diagnostic rejection;
- deterministic human formatting with a known or unknown line.

No tests may be skipped or marked todo.

## Documentation

Update:

- `packages/plantuml-renderer/README.md`;
- `docs/operations/plantuml-renderer.md`;
- `packages/cli/README.md`;
- `docs/product/diagramweave-prd.md`;
- `docs/architecture.md`;
- `CHANGELOG.md`.

The documentation must distinguish safe structured diagnostics from raw child diagnostics and include the exact public record.

## Release decision

Keep package versions at `0.0.0` and changes under `Unreleased`. Structured diagnostics close a substantial CLI and integration gap, but the product still lacks Studio, Language Server, cross-platform real-runtime evidence, signed distribution, and installer workflows.

## References

PlantUML. (2026). *Command-line usage: Standard report (stdrpt)*. https://plantuml.com/command-line

OASIS Open. (2020). *Static Analysis Results Interchange Format (SARIF) Version 2.1.0*. https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
