# Changelog

All notable changes to DiagramWeave will be documented in this file.

The project follows Semantic Versioning after the first release.

## [Unreleased]

### Changed

- Hourly product development now runs an in-workflow OpenCode agent against
  NVIDIA NIM (`NVIDIA_NIM_API_KEY` organization secret) and opens the bounded
  pull request itself; the workflow no longer assumes `COPILOT_GITHUB_TOKEN`
  or the Copilot Agent Tasks API.

### Added

- A transport-neutral LSP 3.18 PlantUML diagnostic session with bounded full-document synchronization, local file-URI validation, exact version/generation stale-result suppression, deeply frozen source-free diagnostics, and embeddable Studio, IDE, naruon, and CWL host APIs.
- Safe structured PlantUML diagnostics that parse bounded `-stdrpt:1` output at the renderer boundary, map one-based PlantUML lines to zero-based LSP-compatible ranges, deeply freeze every record, and propagate only fixed-message diagnostics through renderer errors and `dweave` JSON/human reports without exposing raw stderr, raw labels, source excerpts, executable paths, or credentials.
- A deterministic `dweave validate` and `dweave render` CLI package for one PlantUML file or a recursive directory, with stable JSON and human reports, CI exit codes, symlink and collision rejection, exclusive creation, explicit atomic overwrite, and naruon/CWL embedding APIs.
- Repository contracts and zero-dependency Node.js quality gates.
- Revision-safe edit proposals as the first DiagramWeave Core capability.
- A Contextual Orchestrator adapter boundary for validated LLM proposals.
- A sandboxed, stdin-only PlantUML renderer with bounded SVG/PNG artifacts, a frozen public limit contract, single-pass SVG document and restricted XML prologue validation, source metadata suppression, standard-report error detection, and child termination on stream failures.
- Architecture, security, product, research, and Contextual Orchestrator operations documentation.
- Pull-request-first hourly review, repair, exact-head verification, merge, and bounded product-development governance.
