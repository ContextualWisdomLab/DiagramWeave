# Structured PlantUML Diagnostics Design

## Goal

Expose bounded, source-free, line-addressable PlantUML diagnostics through the existing renderer and CLI contracts so Studio, the future Language Server, naruon, CI systems, and other CWL hosts can identify the failing source line without parsing child-process output themselves.

## Buyer-visible gap

`dweave validate` and `dweave render` previously reported a stable `renderer_failed` code but did not tell the user which source line PlantUML rejected. The renderer already invokes PlantUML with `-stdrpt:1`; PlantUML's documented protocol emits `protocolVersion`, `status`, `lineNumber`, and `label` fields for syntax failures. Discarding the safe line signal forced users to rerun PlantUML manually or inspect raw stderr outside DiagramWeave.

## Approaches considered

### Selected: parse at the renderer boundary

A pure parser in `@contextualwisdomlab/diagramweave-plantuml-renderer` consumes the renderer's existing bounded stderr buffer. The renderer attaches only validated diagnostics to `PlantUmlRendererError`; the CLI validates and clones them again before report publication.

This gives Studio, CLI, Language Server, naruon, and service wrappers one canonical interpretation while keeping raw stderr and labels inside the process boundary.

### Rejected: parse in the CLI

CLI-owned parsing would duplicate PlantUML protocol logic, expand the public exposure surface, and force Studio or the Language Server to depend on the CLI or maintain separate parsers.

### Deferred: separate provider-neutral diagnostics package

A provider-neutral package may be useful after Mermaid, D2, Graphviz, and Structurizr adapters exist. A separate package is unnecessary while PlantUML is the only producer. The public diagnostic already uses the Language Server Protocol range shape so later extraction need not change consumers.

## Standard-report parser

`packages/plantuml-renderer/src/standard-report.js` exports:

```js
parsePlantUmlStandardReport(diagnostics: Uint8Array): Readonly<{
  protocolVersion: 1 | null,
  status: 'ok' | 'error' | 'unknown' | 'invalid',
  diagnostics: readonly Readonly<{
    range: Readonly<{
      start: Readonly<{line: number, character: 0}>,
      end: Readonly<{line: number, character: 0}>
    }>,
    severity: 1,
    code: 'plantuml.syntax',
    source: 'plantuml',
    message: 'PlantUML reported a syntax error.',
    data: Readonly<{plantUmlLineNumber: number}>
  }>[]
}>
```

The parser:

- decodes once as fatal UTF-8;
- recognizes exact line-oriented `protocolVersion`, `status`, and `lineNumber` fields;
- accepts protocol version `1` and fails closed for an explicitly unsupported or malformed version;
- accepts `status=OK` and `status=ERROR`, with error winning over an earlier success line;
- accepts a decimal `lineNumber` from `1` through `2147483647`;
- ignores unknown fields, raw `label` values, and unstructured suffix lines without retaining them;
- returns `unknown` for empty or status-free output;
- returns `invalid` for malformed known fields or invalid UTF-8;
- returns no fabricated diagnostic when an error lacks a valid line;
- maps a one-based PlantUML line to a zero-based, zero-width LSP range at character zero;
- deeply freezes the result, diagnostics array, range, positions, and data.

`sanitizePlantUmlDiagnostics` revalidates, bounds, clones, and freezes public diagnostics crossing package or service boundaries. It accepts at most 32 exact contract records and fails the entire collection closed when any record is malformed or hostile.

## Renderer contract

`createPlantUmlRenderer()` continues to treat nonzero exit, signal termination, `status=ERROR`, and invalid standard reports as failures. A located syntax error raises:

```js
new PlantUmlRendererError(
  'renderer_failed',
  'PlantUML rejected the source or failed to render it.',
  {
    exitCode,
    signal,
    diagnostics: [safeLspDiagnostic]
  }
)
```

Every `PlantUmlRendererError` owns a frozen `diagnostics` array. The constructor never retains caller-owned records and rejects unsupported values. Invalid or locationless reports produce an empty array.

## CLI contract

Every top-level report and every per-file result owns a frozen `diagnostics` array.

- successful `valid` and `rendered` files use `diagnostics: []`;
- renderer failures copy only validated renderer diagnostics;
- input-read and output-publication failures use `diagnostics: []`;
- invocation failures use top-level `diagnostics: []` and no file results;
- the CLI never reparses stderr or recomputes locations;
- unsafe, hostile, oversized, or malformed diagnostics are discarded.

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
  ]
}
```

Human output uses the safe relative path and one-based PlantUML line:

```text
FAIL flows/checkout.puml [renderer_failed] PlantUML rejected the source or failed to render it.
  flows/checkout.puml:2 ERROR [plantuml.syntax] PlantUML reported a syntax error.
```

## Error and privacy boundaries

- raw stderr never crosses the renderer package boundary;
- raw `label` values never cross the parser boundary;
- diagnostics contain no source excerpt, executable path, JAR path, absolute parent path, credential, or arbitrary provider message;
- messages and codes are fixed product strings;
- line numbers are bounded integers;
- malformed and hostile objects fail closed;
- diagnostic collections and nested records are deeply frozen;
- labels or narrative lines containing `status=ERROR` do not become new fields.

## Testing and evidence

The test corpus covers:

- PlantUML's documented syntax-error report at line 2;
- LF and CRLF reports;
- ERROR precedence over an earlier OK line;
- successful, unknown, locationless, and invalid reports;
- labels and narrative text containing private source-like values;
- zero, negative, overflow, non-decimal, duplicate, and malformed fields;
- unsupported protocol versions and invalid UTF-8;
- renderer error propagation and immutability;
- CLI revalidation, hostile getter isolation, JSON propagation, and human formatting;
- empty diagnostics for non-renderer failures.

The verified clean tree passes 242 tests, has no skipped or todo tests, and reports 100% production line, branch, and function coverage plus 100% production JSDoc coverage.

## Documentation

Durable documentation includes the exact public record, line-number conversion, module boundaries, CLI output, privacy rules, product status, and APA 7 references in:

- `docs/research/plantuml-structured-diagnostics.md`;
- `packages/plantuml-renderer/README.md`;
- `docs/operations/plantuml-renderer.md`;
- `packages/cli/README.md`;
- `docs/product/diagramweave-prd.md`;
- `docs/architecture.md`;
- `CHANGELOG.md`.

## Release decision

Package versions remain `0.0.0` and changes remain under `Unreleased`. Structured diagnostics close a substantial CLI and integration gap, but DiagramWeave still lacks Studio, the Language Server, cross-platform real-runtime evidence, signed distribution, and installer workflows.

## References

Microsoft. (2026). *Language Server Protocol specification, version 3.18*. https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

OASIS Open. (2020). *Static Analysis Results Interchange Format (SARIF) Version 2.1.0*. https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

PlantUML. (2026). *Command-line usage: Standard report (stdrpt)*. https://plantuml.com/command-line
