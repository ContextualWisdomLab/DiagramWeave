# Hourly Development and Pull-Request Governance

DiagramWeave uses two repository workflows with distinct but coordinated responsibilities. Both are pull-request-first and fail closed whenever they cannot prove that a mutation is safe.

## Activation

GitHub runs scheduled workflows only from workflow files present on the default branch. These schedules become active only after the files have passed review and merged into `main`. A cron expression is a recurring trigger, not a real-time service-level guarantee; GitHub may delay scheduled runs during platform load.

## Pull-request maintenance loop

`.github/workflows/hourly-pr-maintenance.yml` runs at minute 13 of each hour and can also be invoked manually in dry-run mode.

It calls the organization-central reusable PR review and merge scheduler pinned to immutable commit `3f65dbee6672b78802e7d71d49c390f3817bb03b`. The central workflow performs bounded governance for the caller repository: it can dispatch a missing current-head review, re-check exact-head reviews and required Checks, update at most one outdated branch, and directly merge or enable auto-merge only when repository policy permits.

DiagramWeave does **not** create or require a repository-dispatch personal access token for this path. In particular, there is no `CWL_AUTOMATION_TOKEN` requirement and no extra cross-repository dispatch job. This avoids inventing a credential the repository does not own and removes a redundant failure point in front of the pinned governance workflow.

To adopt a later central scheduler revision, review the `.github` repository change, update the immutable pin and this guide together, run the workflow contract tests, and submit the change through a normal pull request.

## RCA-driven remediation and product-development loop

`.github/workflows/hourly-product-development.yml` runs at minute 47 of each hour. Its single concurrency group prevents overlapping writer sessions. The workflow begins from one fresh machine-readable inventory and selects exactly one of two modes.

### Remediation mode

When at least one open pull request exposes a same-repository head branch, the workflow selects one deterministic candidate. Exact-head failed Checks and requested changes rank ahead of merge conflicts, stale branches, and externally waiting PRs. The selection order is only a prioritization heuristic; it does not assume the selected blocker is repairable.

The workflow checks out the exact current head SHA and captures bounded evidence:

- current PR metadata and changed-file inventory;
- review submissions and unresolved review threads;
- exact-head check runs and commit statuses;
- exact-head GitHub Actions runs;
- a bounded excerpt of failed-run logs.

The OpenCode agent must perform root-cause analysis, distinguish symptoms from root causes, enumerate candidate corrective actions, and verify feasibility against live evidence, available permissions, repository policy, likely causal effect, and side effects. It executes only safe and policy-compliant actions, runs focused and complete verification, and then re-fetches the affected state.

The publishing boundary queries the PR again immediately before pushing. The observed remote head must equal the expected exact current head, and the push must be an ordinary fast-forward push to the existing branch. A moved head, cross-repository branch, malformed ref, or failed verification aborts the mutation. The workflow never force-pushes, changes the PR base, opens a replacement PR, merges, or releases.

Independent approval cannot be manufactured. Queued or pending Checks cannot be declared successful. Approval or check latency alone is not a valid reason to falsify completion, weaken protection, or create noise. When no safe mutation can improve the blocker, the agent leaves the branch unchanged and the autonomous fleet can continue with the next safe, non-conflicting activity. There is no duplicate pull request for an existing change.

### Product-development mode

When the verified inventory contains no open pull request, the workflow may run exactly one bounded OpenCode session routed through the local contextual-orchestrator gateway sidecar and package one buyer-visible increment as one new pull request. Immediately before creating that PR it re-fetches the queue; if another PR appeared after the initial gate, it fails closed rather than creating duplicate work.

The delegated session preserves DiagramWeave's source-first manual editing mode, uses or improves Contextual Orchestrator for product LLM work, retains modular MSA compatibility with central `.github`, naruon, and other CWL services, and satisfies the repository's test, coverage, docstring, security, documentation, and design contracts.

### Common verification boundary

In either mode, the OpenCode process receives no GitHub credential. A separate shell boundary removes transient configuration, rejects metadata-only output, runs `git diff --check`, installs the locked workspace, executes the complete repository verification suite, checks exact package contents, and only then performs a bounded commit and push.

For each push, the shell derives a masked, process-local HTTP `Authorization` header from the built-in token and supplies it through command-scoped Git configuration. The token is never embedded in a remote URL, written to repository configuration, persisted by checkout, or exposed to OpenCode. The command-scoped authentication variables disappear when the push process exits.

The delegated agent is forbidden from merging, publishing, releasing, weakening gates, synthesizing approval, or bypassing branch protection. The central PR-maintenance loop remains the owner of review dispatch, policy evaluation, exact-head revalidation, and final merge.

## Credentials

### Pull-request maintenance

No repository-specific secret is required solely to invoke the pinned reusable central PR review and merge scheduler. The caller grants only the job permissions declared in `.github/workflows/hourly-pr-maintenance.yml`; the reusable workflow owns its bounded review-dispatch and merge-governance authentication paths.

Do not add a personal access token merely to dispatch another central scheduler when the pinned reusable scheduler already performs the same review-dispatch function.

### Remediation and product-development agent

The development agent's model traffic is served by a loopback `contextual-orchestrator` gateway sidecar, not by a direct provider call. The workflow vendors `ContextualWisdomLab/contextual-orchestrator` at a pinned commit (`ORCHESTRATOR_PIN_SHA`, the same commit `ContextualWisdomLab/.github`'s central review sidecar and `contextual-orchestrator`'s own hourly loop pin to), installs its hash-pinned dependencies, and starts it with auto-discovery against whichever of five organization provider secrets are present: `BYTEZ_API_KEY`, `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`. At least one must be present for a model-backed path; a missing individual secret only narrows the gateway's discovered pool.

OpenCode itself never receives a raw provider key. It is configured with an `{env:CONTEXTUAL_ORCHESTRATOR_TOKEN}` reference to the gateway's own ephemeral, per-run bearer token, and its model is set to the gateway's fail-closed, zero-cost virtual pool: `contextual_orchestrator_gateway/orchestrator/free`. The gateway's own auto-discovery, not this workflow, owns fallback across real underlying models and providers.

The built-in token is used by shell steps for inventory, bounded evidence capture, exact-head comparison, branch push, and product PR creation. The OpenCode process is launched with `GH_TOKEN`, `GITHUB_TOKEN`, `REPOSITORY_TOKEN`, and Actions OIDC request variables removed from its environment. Git publication uses an ephemeral masked HTTP header rather than a credential-bearing remote URL.

This replaces the retired Copilot Agent Tasks integration and its `COPILOT_GITHUB_TOKEN` user token. No Copilot subscription is required and the Agent Tasks preview API is not called.

If a model-backed path is selected and every one of the five provider secrets is absent, the run fails visibly and creates nothing. Missing credentials are not repaired by inventing new secret names.

## Dry run

Use the Actions interface to run either workflow with `dry_run: true`.

- PR maintenance invokes the pinned central scheduler in dry-run mode and does not require a separate repository-dispatch credential.
- The development workflow performs the live PR inventory, selects the mode that a real run would use, and prints the exact bounded agent contract without checking out code, reading the model secret, or invoking a model.

A dry run does not require any of the five gateway provider secrets, including `NVIDIA_NIM_API_KEY`. It still requires successful pull-request inventory so an API failure cannot be disguised as a successful simulation.

## Contextual Orchestrator boundary

All product LLM functionality must use or improve `ContextualWisdomLab/contextual-orchestrator` through the DiagramWeave adapter (`packages/contextual-orchestrator`, see `docs/operations/contextual-orchestrator.md`). The hourly workflow itself does not call that product inference API path. Its OpenCode session's own reasoning backend is served by a separate, workflow-local `contextual-orchestrator` gateway sidecar (see above) routed to the same organization's `orchestrator/free` pool, and the delegated agent is instructed to preserve the product's distinct Contextual Orchestrator boundary rather than conflate the two.

## Failure handling

- Central reusable scheduler cannot authenticate or inspect the repository: fail closed in that scheduler; do not add an imaginary repository-local credential as a workaround.
- Pull-request inventory cannot be read or is not a JSON array: fail visibly. Inventory failure is a workflow failure, not a successful skip.
- Only cross-repository PR heads are open: do not mutate an unowned branch and do not create product work behind the active PR queue.
- Selected PR head changes before evidence capture or publication: abort the stale attempt; do not force-push.
- Review or Check finding is invalid, stale, superseded, or infrastructure-only: record that classification internally and do not change code merely to manufacture activity.
- Valid finding has a feasible repository change: reproduce it test-first, implement the smallest correction, run complete verification, push normally, and re-fetch exact-head state.
- Independent approval remains absent: do not synthesize it.
- A required Check is queued or pending: do not call it successful. Continue with the next safe, non-conflicting activity when one exists.
- Dry run: print the selected task contract without reading or requiring any gateway provider credential.
- Selected model path lacks every one of the five gateway provider secrets: fail before installing or invoking OpenCode.
- The vendored gateway sidecar fails to become healthy, or the checked-out commit does not match `ORCHESTRATOR_PIN_SHA`: fail before invoking OpenCode.
- The gateway-routed development agent fails or times out: fail visibly and publish nothing.
- Repository verification fails: publish nothing.
- A product PR appears between inventory and publication: fail closed and create no duplicate pull request.
- Delayed schedule: rely on the next scheduled run or invoke a manual dry run; do not add a duplicate scheduler.
- Central workflow pin becomes stale: update the immutable pin through a reviewed pull request.

## Disablement

To disable autonomous model-backed remediation and product creation, disable `Hourly Product Development` in GitHub Actions or remove its `schedule` event through a pull request. To disable repository-local hourly PR governance, disable `Hourly PR Maintenance`; organization-central event and sweep policies may still process PRs according to organization policy.

Do not remove `NVIDIA_NIM_API_KEY` or the other four gateway provider secrets as an intentional disablement mechanism. Once deterministic gates select the model path, a fully missing credential set is an operational failure and remains visible rather than producing a false-green skip.
