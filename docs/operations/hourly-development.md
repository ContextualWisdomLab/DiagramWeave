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

When the verified inventory contains no open pull request, the workflow runs an ordered, bounded sequence of configured NVIDIA NIM candidates and may package one buyer-visible increment as one new pull request. Immediately before creating that PR it re-fetches the queue; if another PR appeared after the initial gate, it fails closed rather than creating duplicate work.

A model process exit code of zero proves only that the process terminated normally. It is not evidence that product work was completed. After each candidate returns, the trusted shell checks the working tree while excluding metadata-only `PR_MESSAGE.md`. A clean working tree causes that candidate to be discarded and the next configured model to run. Partial output from a failed or clean no-op candidate is reset before the next attempt. If every product candidate fails or completes without a meaningful mutation, the workflow fails visibly and creates no branch or pull request.

The delegated sessions preserve DiagramWeave's source-first manual editing mode, use or improve Contextual Orchestrator for product LLM work, retain modular MSA compatibility with central `.github`, naruon, and other CWL services, and satisfy the repository's test, coverage, docstring, security, documentation, and design contracts.

### Common verification boundary

In either mode, the OpenCode process receives no GitHub credential. A separate shell boundary removes transient configuration, rejects metadata-only output, runs `git diff --check`, installs the locked workspace, executes the complete repository verification suite, checks exact package contents, and only then performs a bounded commit and push.

For each push, the shell derives a masked, process-local HTTP `Authorization` header from the built-in token and supplies it through command-scoped Git configuration. The token is never embedded in a remote URL, written to repository configuration, persisted by checkout, or exposed to OpenCode. The command-scoped authentication variables disappear when the push process exits.

The delegated agent is forbidden from merging, publishing, releasing, weakening gates, synthesizing approval, or bypassing branch protection. The central PR-maintenance loop remains the owner of review dispatch, policy evaluation, exact-head revalidation, and final merge.

## Credentials

### Pull-request maintenance

No repository-specific secret is required solely to invoke the pinned reusable central PR review and merge scheduler. The caller grants only the job permissions declared in `.github/workflows/hourly-pr-maintenance.yml`; the reusable workflow owns its bounded review-dispatch and merge-governance authentication paths.

Do not add a personal access token merely to dispatch another central scheduler when the pinned reusable scheduler already performs the same review-dispatch function.

### Remediation and product-development agent

The development agent authenticates to NVIDIA NIM with the `NVIDIA_NIM_API_KEY` organization secret. That value is injected as `NVIDIA_API_KEY` only after the inventory gate selects an actual model-backed path, and only into the OpenCode model-execution step.

The built-in token is used by shell steps for inventory, bounded evidence capture, exact-head comparison, branch push, and product PR creation. The OpenCode process is launched with `GH_TOKEN`, `GITHUB_TOKEN`, `REPOSITORY_TOKEN`, and Actions OIDC request variables removed from its environment. Git publication uses an ephemeral masked HTTP header rather than a credential-bearing remote URL.

This replaces the retired Copilot Agent Tasks integration and its `COPILOT_GITHUB_TOKEN` user token. No Copilot subscription is required and the Agent Tasks preview API is not called.

If a model-backed path is selected and the NIM secret is absent, the run fails visibly and creates nothing. Missing credentials are not repaired by inventing new secret names.

## Dry run

Use the Actions interface to run either workflow with `dry_run: true`.

- PR maintenance invokes the pinned central scheduler in dry-run mode and does not require a separate repository-dispatch credential.
- The development workflow performs the live PR inventory, selects the mode that a real run would use, and prints the exact bounded agent contract without checking out code, reading the model secret, or invoking a model.

A dry run does not require `NVIDIA_NIM_API_KEY`. It still requires successful pull-request inventory so an API failure cannot be disguised as a successful simulation.

## Contextual Orchestrator boundary

All product LLM functionality must use or improve `ContextualWisdomLab/contextual-orchestrator` through the DiagramWeave adapter. The hourly workflow itself does not call the product inference API. Its OpenCode session uses NVIDIA NIM only as the delegated development agent's reasoning backend and instructs the agent to preserve the Contextual Orchestrator product boundary.

## Failure handling

- Central reusable scheduler cannot authenticate or inspect the repository: fail closed in that scheduler; do not add an imaginary repository-local credential as a workaround.
- Pull-request inventory cannot be read or is not a JSON array: fail visibly. Inventory failure is a workflow failure, not a successful skip.
- Only cross-repository PR heads are open: do not mutate an unowned branch and do not create product work behind the active PR queue.
- Selected PR head changes before evidence capture or publication: abort the stale attempt; do not force-push.
- Review or Check finding is invalid, stale, superseded, or infrastructure-only: record that classification internally and do not change code merely to manufacture activity.
- Valid finding has a feasible repository change: reproduce it test-first, implement the smallest correction, run complete verification, push normally, and re-fetch exact-head state.
- Independent approval remains absent: do not synthesize it.
- A required Check is queued or pending: do not call it successful. Continue with the next safe, non-conflicting activity when one exists.
- Dry run: print the selected task contract without reading or requiring the NVIDIA model credential.
- Selected model path lacks `NVIDIA_NIM_API_KEY`: fail before installing or invoking OpenCode.
- A model candidate exits successfully but leaves no meaningful repository mutation: treat it as incomplete, reset the candidate, and try the next configured model. Exit code zero alone is not completion evidence.
- Every product-mode candidate fails or completes without a meaningful mutation: fail visibly and publish nothing.
- Remediation candidates are exhausted without a safe mutation: only then leave the exact PR head unchanged; do not claim that the blocker was repaired.
- Repository verification fails: publish nothing.
- A product PR appears between inventory and publication: fail closed and create no duplicate pull request.
- Delayed schedule: rely on the next scheduled run or invoke a manual dry run; do not add a duplicate scheduler.
- Central workflow pin becomes stale: update the immutable pin through a reviewed pull request.

## Disablement

To disable autonomous model-backed remediation and product creation, disable `Hourly Product Development` in GitHub Actions or remove its `schedule` event through a pull request. To disable repository-local hourly PR governance, disable `Hourly PR Maintenance`; organization-central event and sweep policies may still process PRs according to organization policy.

Do not remove `NVIDIA_NIM_API_KEY` as an intentional disablement mechanism. Once deterministic gates select the model path, a missing required credential is an operational failure and remains visible rather than producing a false-green skip.
