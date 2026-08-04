# PlantUML Renderer Limit and SVG Validation Hardening Plan

## Goal

Make the renderer's resource contract reusable by Studio, CLI, naruon, and other CWL hosts while reducing validation work for large SVG artifacts and preserving the existing source-first security boundary.

## Scope

- Export one deeply frozen object containing every default, inclusive minimum, and inclusive maximum renderer limit.
- Make renderer option validation consume that same object so documentation, host configuration, and runtime enforcement cannot drift.
- Replace repeated whole-document SVG checks with one UTF-8 decode and one forward markup scan.
- Validate every opening and closing element through an exact-name stack rather than checking only nested `<svg>` tags.
- Accept nested SVG elements while rejecting mismatched tags, malformed boundaries, incomplete roots, trailing nodes, and multiple top-level SVG documents.
- Accept one restricted XML prologue: one leading XML declaration, comments, non-XML processing instructions, and one `svg` DOCTYPE whose declared root name is validated before the actual SVG element.
- Reject duplicate declarations, duplicate or non-SVG DOCTYPE nodes, malformed internal subsets, declarations inside the root, malformed comments, and non-SVG wrappers.
- Document `spawnImpl` as a test-only seam rather than a production extension point.
- Preserve the fixed PlantUML `SANDBOX`, stdin-only source transfer, empty child environment, metadata suppression, standard-report handling, and bounded process contract.

## Test-first evidence

1. Add contract tests for the immutable public limit object and every inclusive boundary.
2. Add default source and output limit regressions.
3. Add accepted and rejected SVG corpus cases, including comments, CDATA, processing instructions, quoted `>` attributes, nested SVG, mismatched element names, invalid closing-tag suffixes, truncated markup, and adjacent roots.
4. Add restricted-prologue regressions for legacy PlantUML processing instructions, SVG DOCTYPE forms, duplicate nodes, malformed subsets, and non-SVG declared roots.
5. Add full public-error-surface source-leak inspection.
6. Add documentation contract tests for the public limits and test-only process seam.
7. Run the complete Node.js test, coverage, syntax, docstring, and package-dry-run gates.

## Verified clean tree

The one-shot repair job published the clean source only after the full repository verification and renderer package dry run succeeded. Its temporary patch, transformer, and workflow inputs were deleted from the resulting commit, leaving only production code, tests, and durable documentation in the pull request.

The branch was then synchronized with the current `main` revision containing the NVIDIA NIM hourly-development workflow. The renderer change set remains limited to its ten production, test, and documentation files, with no duplicated governance implementation.

## Release decision

Keep versions at `0.0.0` and the changelog under `Unreleased`. This is renderer hardening, not an integrated Studio/CLI release candidate.
