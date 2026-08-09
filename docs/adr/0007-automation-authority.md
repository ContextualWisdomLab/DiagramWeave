# ADR-0007: Separate autonomous development, trusted publication, review, merge, and release authority

**Status:** Accepted  
**Date:** 2026-08-09

## Context

Protected `main` already contains an hourly product-development workflow with two materially different actors. The OpenCode/model subprocess receives the bounded product prompt and NVIDIA model credential while GitHub repository tokens and OIDC request credentials are explicitly removed from that process. A later trusted workflow step, running under narrowly scoped GitHub job permissions, may turn a verified working-tree result into an ordinary branch and pull request. Treating those two actors as one “autonomous development” authority obscures the actual credential and review boundary.

## Decision

The model-assisted development process may inspect the checked-out revision, produce a revision-bound working-tree proposal, and emit review evidence such as `PR_MESSAGE.md`; it has no repository publication, approval, merge, tag, package-publish, or release credential.

A separate trusted publisher may create or fast-forward an ordinary proposal branch and open/update the bounded pull request only after deterministic verification and exact target/ref revalidation. That publication is a transport/handoff step, not approval. Opening a pull request does not require human approval, but the resulting exact head must pass repository policy, security/quality gates, and qualifying independent review before protected integration.

Neither the model process nor the trusted publisher may manufacture independent approval, force-push over another writer, weaken required checks, bypass branch protection, merge protected branches, tag, publish packages, or release. Reviewer, merge, and release credential chains remain independent from both development and publication authority. Active PR #24 refines hourly remediation while preserving this separation.

## Consequences

- Repository documentation and diagrams must distinguish proposal generation from trusted GitHub publication.
- Model-controlled content cannot directly decide that its own change is publishable; deterministic verification and the trusted handoff boundary mediate publication.
- A successfully opened PR is only a review candidate, never merge or release evidence.
- Future changes that give the model process repository credentials, permit unverified publication, or combine publisher and counted-review authority require a new ADR and security/threat-model review.