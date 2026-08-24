# ADR-0003: Keep PlantUML rendering local, bounded, and isolated

**Status:** Accepted
**Date:** 2026-08-09
**Updated:** 2026-08-24

## Context

PlantUML can include local files and remote URLs, embed source in generated
PNG or SVG metadata, and emit unstructured stderr. Those capabilities are
unsafe as a default reusable boundary for Studio, CLI, naruon, and other CWL
hosts.

PlantUML documents a `SANDBOX` security profile in which the process cannot
access local files or URLs and allowlists are ignored (PlantUML, n.d.-c). The
official command-line record documents stdin `-pipe` transfer, `-nometadata`
suppression of encoded source in generated files, and `-stdrpt:1` standard
error reports (PlantUML, n.d.-a). Those published controls are the basis for a
local, host-supplied Java/JAR renderer that never downloads dependencies.

Raw child output remains untrusted. Callers need validated SVG or PNG bytes and
fixed safe diagnostics, not stderr, labels, or source excerpts. Diagnostic
ranges reuse the Language Server Protocol line/character shape so CLI and
editor hosts share one record (Microsoft, n.d.).

## Decision

The foundation renderer receives source through stdin, invokes host-supplied
Java/PlantUML without a shell, uses an empty child environment and PlantUML
`SANDBOX`, suppresses source metadata, and bounds source, output, diagnostics,
and execution time. It does not download dependencies, follow includes, or
fetch resources. Raw child output remains inside the renderer boundary;
reusable callers receive validated artifacts and fixed safe diagnostics.

A later include-capable mode is a separate explicit policy, not a relaxation of
this package's `SANDBOX` contract. PlantUML's newer command-line redesign is
documented as beta on the same official page and is not treated as the current
renderer contract (PlantUML, n.d.-a).

## Consequences

- The package requires absolute Java and JAR paths from the host. It does not
  bundle, discover, or download PlantUML, Graphviz, or fonts.
- Generated artifacts are immutable and tied to the Core SHA-256 source
  revision. SVG remains untrusted active content; hosts must not inject it
  through `innerHTML`.
- Public errors never include raw stderr, raw PlantUML labels, source
  excerpts, executable paths, or environment values.
- Studio, CLI, naruon, and the Language Server depend on the package contract
  rather than spawning Java themselves.
- Operating-system cgroup, job-object, or container quotas remain a host
  responsibility for hostile or high-volume diagrams.

## References — APA 7th edition

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 24, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/

PlantUML. (n.d.-a). *Command line*. Retrieved August 24, 2026, from
https://plantuml.com/command-line

PlantUML. (n.d.-b). *PlantUML*. Retrieved August 24, 2026, from
https://plantuml.com/

PlantUML. (n.d.-c). *Deploy PlantUML safely*. Retrieved August 24, 2026, from
https://plantuml.com/security
