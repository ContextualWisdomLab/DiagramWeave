# ADR-0006: Keep model access behind an optional orchestrator adapter

**Status:** Accepted
**Date:** 2026-08-09
**Updated:** 2026-08-24

## Context

Manual editing, local render, CLI validation, and Language Server intelligence
must remain complete without an account, network connection, or LLM. Baking a
provider client into Core would make those workflows depend on remote
credentials and would couple revision semantics to one vendor API.

Generated edits are already untrusted proposals (ADR-0002). The remaining
question is how a host optionally obtains a proposal. Contextual Orchestrator
exposes an OpenAI-compatible `POST /v1/chat/completions` boundary; DiagramWeave
depends on that published request/response shape, not on a particular worker
model. Assistant content must be one JSON object that Core can validate (Bray,
2017). The adapter hashes the exact source with SHA-256 before the request so
the returned proposal names the revision it was built from (National Institute
of Standards and Technology, 2015).

This repository does not use an OpenAPI description for that boundary. The
adapter contract is the explicit endpoint, model, token, timeout, and JSON
proposal parse implemented in the package.

## Decision

DiagramWeave Core and local editing, rendering, and editor intelligence do not
depend on an LLM. Remote generated-edit capability is isolated behind the
Contextual Orchestrator adapter with explicit endpoint, model, token, request
bounds, timeout, and strict proposal parsing. Other provider strategies can be
added through equivalent adapters without changing Core mutation and revision
semantics.

The adapter permits remote HTTPS and loopback-only HTTP. It does not read
process environment variables, persist tokens, log source or prompts, or apply
the returned edit.

## Consequences

- Studio, naruon, and other CWL hosts may omit the adapter entirely and still
  edit, validate, render, and navigate source.
- naruon composes Core, renderer, CLI, Language Server, and optionally this
  adapter as independently reusable packages. It does not become the only way
  to call DiagramWeave.
- A new provider is a new adapter with the same Core-validated `EditProposal`
  output. It must not introduce a hidden mutation path or a second revision
  algorithm.
- Provider error bodies are not read, preventing secret or prompt reflection
  into user-visible errors.
- Changing Core so that local packages require an LLM, or calling a provider
  directly from Core, would require a new ADR.

## References — APA 7th edition

Bray, T. (Ed.). (2017). *The JavaScript Object Notation (JSON) data interchange
format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259

National Institute of Standards and Technology. (2015). *Secure Hash Standard
(SHS)* (FIPS PUB 180-4). U.S. Department of Commerce.
https://doi.org/10.6028/NIST.FIPS.180-4
