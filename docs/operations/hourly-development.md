# Hourly Development and Pull-Request Governance

DiagramWeave has one active scheduled governance loop and one deliberately disabled model-backed entry point. Both fail closed when their evidence or authority is incomplete.

## Hourly PR Maintenance

`.github/workflows/hourly-pr-maintenance.yml` remains scheduled and supports manual dry runs. It calls the organization-central reusable review and merge scheduler pinned to immutable commit `3f65dbee6672b78802e7d71d49c390f3817bb03b`.

That reusable workflow may inspect open pull requests, dispatch missing current-head review, re-check exact-head reviews and required Checks, update at most one outdated branch, and merge or enable auto-merge only when repository policy permits. DiagramWeave supplies no repository-dispatch personal access token and does not copy the central policy locally.

To adopt a later scheduler revision, review the `.github` owner change, update the immutable pin and this guide together, run the workflow contract tests, and submit a normal pull request.

## Hourly Product Development

`.github/workflows/hourly-product-development.yml` is manual dispatch only and always fails closed. It has read-only contents permission, checks out no source, receives no provider credentials, invokes no model, mutates no branch, and opens no pull request.

This gate is intentional. Fresh evidence recorded on 2026-10-03 showed zero GitHub Releases for `ContextualWisdomLab/contextual-orchestrator`. Owner Issue `ContextualWisdomLab/contextual-orchestrator#1023` tracks the missing immutable `orchestrator/free` GitHub Actions gateway contract. Until that owner publishes a versioned release, a DiagramWeave consumer may not clone owner source, start a sidecar from a branch, copy a workflow, call a provider directly, read an owner database, or depend on a temporary branch.

Issue `ContextualWisdomLab/DiagramWeave#35` tracks the future consumer adoption. Issue `ContextualWisdomLab/DiagramWeave#28` tracks the still-required separation between untrusted proposal verification and privileged publication.

## Release-gated reactivation contract

Reactivation requires this evidence in order:

1. the canonical owner adds RED contract tests, implements the gateway, and reaches integrated GREEN;
2. the owner publishes an immutable versioned release with API/schema, security, provenance, and behavior evidence;
3. DiagramWeave pins that release and validates the released contract without importing owner source;
4. a thin caller uses only the gateway token and requests `orchestrator/free`—it names no provider, concrete model, provider group, or paid fallback;
5. exact-head consumer contract, behavior, security, SBOM, and provenance Checks pass before ordinary merge.

The default model timeout remains null. A future caller must distinguish user cancellation, upstream provider termination, and an explicitly configured administrative timeout; it must not stop reasoning, streaming, or tool calls merely because elapsed time crossed a caller-owned default.

## Failure handling

- The central reusable scheduler cannot authenticate or inspect the repository: fail closed in that scheduler; do not invent a local credential workaround.
- A review or Check is pending: do not represent it as successful and do not manufacture approval.
- The owner still has zero GitHub Releases or Issue `#1023` is incomplete: keep product development disabled.
- A release exists but lacks the required API/schema, security, provenance, or behavior evidence: keep the consumer disabled and repair the owner.
- A proposed caller needs provider credentials, provider/model selection, owner source, or write permission: reject the proposal as a boundary violation.
- A selected exact head moves during future publication: abort; never force-push.

## Disablement

The model-backed path is already disabled by design. The visible manual action exists only to return a durable failure reason. Do not turn missing secrets into the disablement mechanism and do not add a schedule until an immutable owner release has passed the complete consumer adoption contract.
