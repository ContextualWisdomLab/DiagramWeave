# PlantUML Renderer Limit and SVG Validation Hardening Plan

## Goal

Make the renderer's resource contract reusable by Studio, CLI, naruon, and other CWL hosts while reducing validation work for large SVG artifacts and preserving the existing source-first security boundary.

## Scope

- Export one deeply frozen object containing every default, inclusive minimum, and inclusive maximum renderer limit.
- Make renderer option validation consume that same object so documentation, host configuration, and runtime enforcement cannot drift.
- Replace repeated whole-document SVG checks with one UTF-8 decode and one forward markup scan.
- Accept nested SVG elements while rejecting malformed boundaries, incomplete roots, and multiple top-level SVG documents.
- Document `spawnImpl` as a test-only seam rather than a production extension point.
- Preserve the fixed PlantUML `SANDBOX`, stdin-only source transfer, empty child environment, metadata suppression, standard-report handling, and bounded process contract.

## Test-first evidence

1. Add contract tests for the immutable public limit object and every inclusive boundary.
2. Add default source and output limit regressions.
3. Add accepted and rejected SVG corpus cases, including comments, CDATA, processing instructions, quoted `>` attributes, nested SVG, truncated markup, and adjacent roots.
4. Add full public-error-surface source-leak inspection.
5. Add documentation contract tests for the public limits and test-only process seam.
6. Run the complete Node.js test, coverage, syntax, docstring, and package-dry-run gates.

## Release decision

Keep versions at `0.0.0` and the changelog under `Unreleased`. This is renderer hardening, not an integrated Studio/CLI release candidate.
