# ADR-0008: Adaptive contextual-orchestrator mode is the proposal default

- Status: Accepted
- Date: 2026-08-16

## Context

DiagramWeave's adapter sent an OpenAI-compatible request without an explicit orchestration policy. The gateway currently defaults an omitted mode to adaptive behavior, but the consumer contract did not make that requirement reviewable or regression-safe. A consumer-selected single-model route would also prevent the orchestration plane from allocating additional test-time compute when a difficult proposal requires verification.

## Decision

Every edit-proposal request includes `mode: "auto"`.

The orchestration plane owns model and provider selection, workflow depth, verification, fallback, and known-price optimization. Quality sufficiency is the first constraint; cost is minimized among execution paths that satisfy it. Unknown price metadata is not interpreted as zero cost.

DiagramWeave continues to own the source-first prompt, revision binding, strict JSON extraction, scope validation, and Core proposal validation. Explicit route or conduct modes are reserved for controlled ablation or a documented operational override and are not adapter defaults.

## Consequences

Simple proposals may still use one worker when the adaptive policy finds that sufficient. Harder proposals may use deeper orchestration without changing the DiagramWeave API. The adapter remains provider-neutral and sends no tool authority.

## References

Omidvar, H., & Akhlaghi, V. (2026). *A communication-theoretic framework for LLM agents: Cost-aware adaptive reliability* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2605.09121

Tang, Y., Cetin, E., Xu, J., Sun, Q., Nielsen, S., Richard, V., Goda, H., Tymchenko, I., Nguyen, N., Lee, H., Ashiga, M., Kotyan, S., Kuroki, S., & Clanuwat, T. (2026). *Sakana Fugu technical report* [Technical report]. arXiv. https://doi.org/10.48550/arXiv.2606.21228
