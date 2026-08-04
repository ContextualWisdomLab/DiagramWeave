# PlantUML structured diagnostics research note

## Decision

DiagramWeave converts PlantUML's bounded `-stdrpt:1` output into a small,
source-free diagnostic contract that can be consumed unchanged by the CLI,
Studio, naruon, and the future Language Server.

The renderer already runs PlantUML with `-stdrpt:1`, `-failfast2`, and `-pipe`.
PlantUML documents protocol version, status, line number, and label fields for
`-stdrpt:1`. It also documents that `-failfast2` performs a syntax-checking pass
before generation and that `-pipe` accepts source on standard input and emits the
artifact on standard output. The implementation therefore parses only the
bounded standard-report bytes already captured by the renderer; it does not
change the process, filesystem, network, or source-transmission boundary.

The diagnostic uses a Language Server Protocol-compatible range so the same
record can later flow into LSP 3.18 without a conversion-specific data model.
PlantUML reports a one-based line and no character range, so DiagramWeave maps it
to a zero-width range at character zero on the corresponding zero-based line.
Severity `1` represents an error. The raw `label` and unstructured stderr suffix
are never copied because they are untrusted and may contain source-derived text.

## Stable contract

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

## Security and compatibility rules

- Accept only UTF-8 bytes from the renderer's existing bounded stderr buffer.
- Recognize PlantUML standard-report protocol version `1`; fail closed for an
  explicitly unsupported or malformed protocol version.
- Let `status=ERROR` win over an earlier `status=OK` line.
- Require a positive 32-bit line number before emitting a located diagnostic.
- Never expose the raw label, stderr suffix, source, Java path, JAR path, token,
  or absolute workspace parent.
- Deeply freeze diagnostics before they cross package boundaries.
- The CLI revalidates and clones renderer diagnostics rather than trusting an
  arbitrary thrown object.
- An error without a valid line remains an error but carries no fabricated
  source range.

## Realistic regression fixture

The parser test uses PlantUML's documented syntax-error report at line 2. The
expected result is an error at PlantUML line 2 and LSP-compatible line index 1.
Neither the diagram content nor PlantUML's raw label appears in the public result.

## References

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 4, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

OASIS Open. (2023, August 28). *Static Analysis Results Interchange Format
(SARIF) Version 2.1.0 Plus Errata 01*.
https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html

PlantUML. (n.d.). *Command-line usage: Standard report (stdrpt)*. Retrieved
August 4, 2026, from https://plantuml.com/command-line
