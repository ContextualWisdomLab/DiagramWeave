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

- Repository contracts and zero-dependency Node.js quality gates.
- Revision-safe edit proposals as the first DiagramWeave Core capability.
- A Contextual Orchestrator adapter boundary for validated LLM proposals.
- A sandboxed, stdin-only PlantUML renderer with bounded SVG/PNG artifacts, source metadata suppression, standard-report error detection, and child termination on stream failures.
- Architecture, security, product, and Contextual Orchestrator operations documentation.
- Pull-request-first hourly review, repair, exact-head verification, merge, and bounded product-development governance.
