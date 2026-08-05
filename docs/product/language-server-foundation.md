# DiagramWeave Language Server foundation scope

This slice advances PRD requirements G-06, FR-011, and FR-023 by turning the
shared structured PlantUML diagnostic contract into a reusable LSP 3.18
session.

## Implemented

- initialize/initialized/shutdown/exit lifecycle;
- full-document open/change/close synchronization;
- safe relative diagnostics through `textDocument/publishDiagnostics`;
- exact version and stale-render suppression;
- transport-neutral embedding for Studio, IDEs, naruon, and CWL hosts;
- local-file URI and resource-limit trust boundaries;
- source-free operational renderer diagnostics.

## Explicitly deferred

- JSON-RPC and Content-Length transport;
- standalone stdio executable;
- completion and hover;
- document symbols and outline;
- definition, references, and rename;
- workspace indexing and include graph;
- cancellation and progress;
- Studio UI integration.

Deferring these capabilities keeps the first language-server PR reviewable and
ensures future features reuse one validated document lifecycle rather than
building separate editor-specific implementations.
