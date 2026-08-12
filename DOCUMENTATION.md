# DiagramWeave Documentation Map

This index makes the repository's product, technical, architecture, safety, and operating memory discoverable without duplicating the already-strong slice documentation.

| Area | Canonical document |
|---|---|
| Product requirements | [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md) |
| Technical requirements | [`docs/TRD.md`](docs/TRD.md) |
| Architecture | [`docs/architecture.md`](docs/architecture.md) |
| UML/runtime views | [`docs/UML.md`](docs/UML.md) |
| Conceptual domain/ERD | [`docs/ERD.md`](docs/ERD.md) |
| Security model | [`docs/security-model.md`](docs/security-model.md) |
| Threat model | [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) |
| Test strategy | [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md) |
| Operability/release/recovery | [`docs/OPERABILITY.md`](docs/OPERABILITY.md) |
| Requirements/evidence traceability | [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) |
| Architecture decisions | [`docs/adr/README.md`](docs/adr/README.md) |
| Product-slice records | [`docs/product/`](docs/product/) |
| Research/standards records | [`docs/research/`](docs/research/) |
| Operational guides | [`docs/operations/`](docs/operations/) |
| Security reporting | [`SECURITY.md`](SECURITY.md) |
| Agent instructions | [`AGENTS.md`](AGENTS.md) |
| Agent context | [`CLAUDE.md`](CLAUDE.md) |
| Product overview | [`README.md`](README.md) |
| Change history | [`CHANGELOG.md`](CHANGELOG.md) |

## Maturity vocabulary

- **implemented-main** — present on protected `main` and represented by source/tests.
- **active-PR** — exists only on an open pull request and is not a released/current-main claim.
- **future-host** — product surface such as Studio that is intentionally not implemented in this foundation yet.
- **conceptual** — logical domain entity or relationship; not evidence of persistence.
- **host-owned** — responsibility belongs to Studio, naruon, IDE, deployment wrapper, or another host.

Current protected main implements the source-first Core, Contextual Orchestrator adapter, sandboxed PlantUML renderer, CLI, transport-neutral Language Server and stdio adapter, diagnostics, symbols, completion, folding, hover, same-document definition and reference navigation, and work-conserving hourly-governance remediation. DiagramWeave Studio remains a future-host boundary.
