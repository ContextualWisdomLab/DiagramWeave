# Hourly Development and Pull-Request Governance

DiagramWeave uses two repository workflows with different responsibilities. Both are intentionally pull-request-first and fail closed when they cannot prove that a mutation is safe.

## Activation

GitHub only runs a repository's scheduled workflows from files present on the default branch. The schedules therefore become active only after these workflow files have passed review and merged into `main`. A schedule is a recurring trigger, not a real-time service-level guarantee: GitHub can delay a scheduled run during platform load.

## Pull-request maintenance loop

`.github/workflows/hourly-pr-maintenance.yml` runs at minute 13 of each hour and can also be invoked manually in dry run mode.

It uses two organization-central control paths:

1. a repository dispatch event asks `ContextualWisdomLab/.github` to inspect unresolved review feedback and dispatch at most one bounded repair with a one-hour same-head retry interval;
2. the reusable merge scheduler, pinned to immutable commit `3f65dbee6672b78802e7d71d49c390f3817bb03b`, re-checks exact-head reviews and required Checks, updates at most one outdated branch, and directly merges or enables auto-merge only when repository policy permits.

The repair path deliberately dispatches the central repository's default-branch workflow instead of calling the older reusable repair workflow. That keeps privileged scheduler code under the central repository's protected default branch and avoids a caller believing it pinned the implementation while the called workflow checks out a mutable ref internally. DiagramWeave does not copy central repair code.

To adopt a later merge-scheduler revision, review the `.github` repository change, replace the pinned revision in the workflow and this guide together, run the workflow contract tests, and submit the update through a normal pull request.

## Product-development loop

`.github/workflows/hourly-product-development.yml` runs at minute 47 of each hour. It creates no work while any pull request is open, and its single concurrency group keeps agent sessions single-flight.

When the repository has no open pull request, it runs exactly one bounded in-workflow OpenCode agent session against NVIDIA NIM and packages the resulting working tree as one pull request. The delegated session must preserve DiagramWeave's source-first manual editing mode, use or improve Contextual Orchestrator for product LLM work, retain modular MSA compatibility with central `.github`, naruon, and other CWL services, and satisfy the repository's test, coverage, docstring, security, documentation, and design rules.

The delegated agent is forbidden from merging, publishing, releasing, weakening gates, or bypassing branch protection. The pull-request maintenance loop owns review, repair, exact-head revalidation, and merge.

## Credentials

### Central PR repair dispatch

Configure an organization or repository secret named `CWL_AUTOMATION_TOKEN` with a credential that can create repository-dispatch events in `ContextualWisdomLab/.github`. Limit the credential to that repository and the minimum permission required by GitHub for repository dispatch. The workflow uses it only for the static `pr-review-fix-scheduler` event; it never passes user-supplied repository or workflow names.

If this secret is absent, the repair-dispatch job fails closed and emits `central_dispatch_token_unavailable`. The pinned review-and-merge scheduler still runs through `if: always()`, so missing repair credentials cannot disable exact-head review, branch-update, or policy-compliant merge evaluation.

### Product-development agent credential

The agent authenticates to NVIDIA NIM with the `NVIDIA_NIM_API_KEY` organization secret, bound inside the job to `NVIDIA_API_KEY` for the pinned, SHA256-verified OpenCode CLI. This replaces the retired Copilot Agent Tasks integration and its `COPILOT_GITHUB_TOKEN` user token: no Copilot subscription is required, and the Agent Tasks public preview API is no longer called. The built-in token handles pull-request inventory, the branch push, and pull-request creation; the OpenCode agent process runs with every GitHub credential stripped from its environment.

If the secret is missing, pull-request inventory fails, or an open pull request exists, the product-development workflow fails closed and creates nothing.

## Dry run

Use the Actions interface to run either workflow with `dry_run: true`.

- PR maintenance prints the static central repair-dispatch payload and asks the pinned merge scheduler to run in dry-run mode.
- Product development evaluates all gates and prints the exact bounded agent prompt without starting an agent session.

A dry run still requires readable pull-request inventory and the configured `NVIDIA_NIM_API_KEY`, because the gate proves the session could actually start.

## Contextual Orchestrator boundary

All product LLM functionality must use or improve `ContextualWisdomLab/contextual-orchestrator` through the DiagramWeave adapter. The hourly workflow itself does not call the product inference API; its OpenCode session uses NVIDIA NIM only as the delegated development agent's own reasoning backend and instructs that agent to preserve the Contextual Orchestrator product boundary.

## Failure handling

- Inventory failure: emit a reason and start no session.
- Every NVIDIA NIM model candidate fails: discard partial work, fail the run visibly, and propose nothing.
- Open pull request: allow PR maintenance to finish before new development starts.
- Required Check or independent review failure: do not merge or release.
- Delayed schedule: rely on the next scheduled run or use a manual dry run; do not add a duplicate scheduler.
- Central repair dispatch is unauthorized: verify `CWL_AUTOMATION_TOKEN` scope and the central repository allowlist; do not fall back to a mutable reusable workflow.
- Central merge workflow pin becomes stale: update the immutable pin through a reviewed pull request.

## Disablement

To disable only autonomous product creation, disable `Hourly Product Development` in GitHub Actions or remove its `schedule` event through a pull request. To disable repository-local hourly PR maintenance, disable `Hourly PR Maintenance`; the organization-central event and sweep policies may still process pull requests according to organization policy.

Removing this repository's access to `NVIDIA_NIM_API_KEY` also disables product development safely, but workflow disablement is preferable when the pause is intentional because the workflow summary then avoids recurring credential warnings.
