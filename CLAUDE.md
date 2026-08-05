# DiagramWeave Instructions for Claude-Compatible Agents

Read and follow [`AGENTS.md`](AGENTS.md) as the authoritative repository agent
contract. This file is a compatibility entry point and intentionally does not
fork those rules.

Before changing code:

1. inspect the current open PR queue and process review feedback first;
2. use test-driven development and preserve exact 100% production
   statement/branch/function coverage and production JSDoc;
3. preserve the source-first, revision-bound, local-renderer, modular package,
   and no-hidden-mutation boundaries;
4. use current authoritative standards or primary research and record APA
   7th-edition references in durable documentation;
5. keep JSON-RPC, source, URI, renderer, filesystem, LLM, and credential inputs
   inside their explicit trust boundaries;
6. use OpenCode with `NVIDIA_NIM_API_KEY` for scheduled product-development
   automation and never introduce `COPILOT_GITHUB_TOKEN`;
7. do not weaken checks, branch protection, review independence, package gates,
   or release evidence.

Architecture entry points:

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/security-model.md`](docs/security-model.md)
- [`docs/product/diagramweave-prd.md`](docs/product/diagramweave-prd.md)
- [`CHANGELOG.md`](CHANGELOG.md)
