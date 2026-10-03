# ADR-0008: Fail closed until the orchestrator gateway is immutably released

**Status:** Proposed
**Date:** 2026-10-03

## Problem

Protected `main` schedules a model-backed development workflow that selects NVIDIA NIM endpoints and models, reads a provider credential, and gives the same job repository write authority. That implementation bypasses the canonical `ContextualWisdomLab/contextual-orchestrator` ownership boundary and weakens ADR-0007's intended separation between untrusted proposal generation and privileged publication.

The canonical owner currently has zero GitHub Releases. Owner Issue `ContextualWisdomLab/contextual-orchestrator#1023` records the missing immutable `orchestrator/free` Actions gateway contract. An open owner PR or branch is Proposed evidence, not a versioned consumer dependency.

## Constraints

- DiagramWeave must not copy owner source, run a sidecar from an owner branch, read an owner database, or depend on a temporary branch.
- GitHub Actions callers may request only `orchestrator/free` with the gateway token. Provider, model, group, and paid-fallback discovery belong to the owner.
- Missing capability fails closed without a paid bypass.
- Model execution must not share repository publication credentials. The default model timeout remains null; upstream completion, user cancellation, and an explicit administrative timeout are distinct terminal causes.
- Pull-request review, exact-head Checks, protected merge, tag, package publication, and release stay independently governed.

## Options considered

### Keep the direct NVIDIA NIM workflow

Rejected. It makes the consumer a second writer for provider discovery and routing, exposes provider credentials outside the canonical owner, hard-codes mutable model choices, and combines model execution with a write-capable job.

### Copy or start the owner implementation from its default branch

Rejected. Source or branch consumption is not an immutable released contract and would make DiagramWeave responsible for the owner's internal runtime and dependency graph.

### Disable model-backed automation until an immutable owner release exists

Selected for this Proposed ADR. The named workflow remains manual and read-only so operators receive a precise failure reason. It performs no checkout, model call, branch mutation, or pull-request creation.

## Decision

DiagramWeave will keep model-backed product development fail-closed until the canonical owner completes RED-to-GREEN contract implementation and publishes an immutable release with API/schema, behavior, security, SBOM, and provenance evidence. Consumer adoption will then pin that release, use only the gateway token, request only `orchestrator/free`, and pass exact-head consumer contract tests before ordinary merge.

The scheduled organization-central PR governance workflow remains independent and active. ADR-0007 continues to govern publication and review authority; this ADR replaces only its assumption that a repository-local provider-backed model job is an acceptable proposal source.

## Consequences and risks

- Autonomous product increments pause, while review/repair/merge governance continues.
- Operators get a visible deterministic error instead of a false-green skip or an unreleased dependency.
- Owner release latency delays reactivation. That cost is preferred to duplicating the owner boundary or leaking provider selection into a consumer.
- A future release can still be unsuitable; release existence is necessary but not sufficient, so consumer conformance evidence remains mandatory.

## User, operations, and failure scenes

- A maintainer manually invokes the disabled workflow and receives links to owner Issue `#1023` and DiagramWeave Issues `#35` and `#28`; no source or credential is touched.
- The owner publishes a tag without API/schema or provenance evidence; DiagramWeave stays disabled and reports the incomplete release contract.
- A proposed caller supplies a concrete free model “temporarily”; review rejects it because `orchestrator/free` is the only consumer-visible model identity.
- A model call eventually runs longer than expected; the consumer does not terminate it through an implicit elapsed-time default. Only upstream termination, user cancellation, or an explicit administrative timeout ends it.

## Follow-up

1. Complete and immutably release `ContextualWisdomLab/contextual-orchestrator#1023`.
2. Repair DiagramWeave Issue `#28` so proposal verification and publication use distinct authority.
3. Implement Issue `#35` against the released gateway contract with RED consumer fixtures, exact release pinning, and exact-head Checks.
4. Accept this ADR only when its fail-closed workflow and documentation reach protected `main`; accept a later reactivation ADR only with owner-release and consumer-conformance evidence.
