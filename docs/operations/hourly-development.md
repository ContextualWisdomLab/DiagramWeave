# Hourly Development and Pull-Request Governance

DiagramWeave uses two repository workflows with different responsibilities. Both are intentionally pull-request-first and fail closed when they cannot prove that a mutation is safe.

## Activation

GitHub only runs a repository's scheduled workflows from files present on the default branch. The schedules therefore become active only after these workflow files have passed review and merged into `main`. A schedule is a recurring trigger, not a real-time service-level guarantee: GitHub can delay a scheduled run during platform load.

## Pull-request maintenance loop

`.github/workflows/hourly-pr-maintenance.yml` runs at minute 13 of each hour and can also be invoked manually in dry run mode.

It calls the organization-central reusable PR review and merge scheduler pinned to immutable commit `3f65dbee6672b78802e7d71d49c390f3817bb03b`. The central workflow already performs the complete bounded governance loop for the caller repository: it can dispatch a missing current-head review, re-check exact-head reviews and required Checks, update at most one outdated branch, and directly merge or enable auto-merge only when repository policy permits.

DiagramWeave therefore does **not** create or require a repository-dispatch personal access token for this path. In particular, there is no `CWL_AUTOMATION_TOKEN` requirement and no extra cross-repository dispatch job. This avoids inventing a credential that the repository does not own and removes a redundant failure point in front of the pinned governance workflow.

To adopt a later merge-scheduler revision, review the `.github` repository change, replace the pinned revision in the workflow and this guide together, run the workflow contract tests, and submit the update through a normal pull request.

## Product-development loop

`.github/workflows/hourly-product-development.yml` runs at minute 47 of each hour. It creates no work while any pull request is open, and its single concurrency group keeps agent sessions single-flight.

The workflow first inventories open pull requests. An inventory transport or response failure is a workflow failure because no safe queue decision can be proved. An existing pull request is a successful deterministic stop owned by PR governance. A requested dry run is then a successful credential-free stop that prints the bounded task contract. Only the remaining ready path can require NVIDIA credentials and start one bounded OpenCode agent session.

When the repository has no open pull request and no dry run was requested, it runs exactly one bounded in-workflow OpenCode agent session against NVIDIA NIM and packages the resulting working tree as one pull request. The delegated session must preserve DiagramWeave's source-first manual editing mode, use or improve Contextual Orchestrator for product LLM work, retain modular MSA compatibility with central `.github`, naruon, and other CWL services, and satisfy the repository's test, coverage, docstring, security, documentation, and design rules.

### RCA-to-action discipline

A root-cause analysis is an intermediate decision artifact, not a terminal deliverable. When the delegated session encounters a failure, blocker, anomaly, or unexpected state, it must continue through the following bounded loop in the same run:

1. reproduce or otherwise establish the failure with current evidence;
2. identify the root cause and distinguish it from symptoms;
3. generate concrete corrective-action candidates;
4. test each candidate's feasibility against live repository state, current permissions, configured credentials, supported APIs, available tools, remaining execution time, and the one-PR scope;
5. execute the highest-value feasible candidate immediately;
6. if that candidate is disproved or infeasible, retain the evidence and attempt the next feasible candidate;
7. rerun focused verification and the complete applicable quality gates after mutation.

The session must not infer that a credential, permission, service, API, runner, branch, or other repository capability exists merely because a proposed design would need it. Live evidence is required. In particular, a missing capability is not repaired by inventing a new secret name and making operators provision it when an existing GitHub-native or central workflow path already solves the problem.

Stopping without a code or configuration change is permitted only when the session has tested the bounded candidates and no feasible action remains. The resulting pull-request evidence must then name the failed feasibility checks and the smallest genuinely external prerequisite. “RCA complete” by itself is not a completion condition.

The delegated agent is forbidden from merging, publishing, releasing, weakening gates, or bypassing branch protection. The pull-request maintenance loop owns review, repair, exact-head revalidation, and merge.

## Credentials

### Pull-request maintenance

No repository-specific secret is required solely to invoke the pinned reusable central PR review and merge scheduler. The caller grants only the job permissions declared in `.github/workflows/hourly-pr-maintenance.yml`; the reusable workflow is responsible for its own bounded review-dispatch and merge-governance authentication paths.

Do not add a personal access token merely to dispatch another central scheduler when the pinned reusable scheduler already performs the same review-dispatch function.

### Product-development agent credential

The product-development agent authenticates to NVIDIA NIM with the `NVIDIA_NIM_API_KEY` organization secret. The workflow injects that value as `NVIDIA_API_KEY` only after open-pull-request and dry-run decisions select the actual model-backed path, and again only into the OpenCode model-execution step. Pull-request inventory, open-PR stops, dry runs, checkout, task preparation, and PR governance do not receive the model credential.

This replaces the retired Copilot Agent Tasks integration and its `COPILOT_GITHUB_TOKEN` user token: no Copilot subscription is required, and the Agent Tasks public preview API is no longer called. The built-in token handles pull-request inventory, the branch push, and pull-request creation; the OpenCode agent process runs with every GitHub credential stripped from its environment.

If the ready model path is selected and the NIM secret is missing, the workflow fails visibly and creates nothing. Missing product-development credentials are not repaired by inventing new secret names.

## Dry run

Use the Actions interface to run either workflow with `dry_run: true`.

- PR maintenance invokes the pinned central scheduler in dry-run mode; it does not require a separate repository-dispatch credential.
- Product development performs readable pull-request inventory, selects `reason=dry_run`, and prints the exact bounded agent prompt without starting an agent session.

A product-development dry run does not require `NVIDIA_NIM_API_KEY`, because no NVIDIA model call occurs. It still requires successful pull-request inventory so the workflow does not disguise a GitHub API failure as a dry-run success.

## Contextual Orchestrator boundary

All product LLM functionality must use or improve `ContextualWisdomLab/contextual-orchestrator` through the DiagramWeave adapter. The hourly workflow itself does not call the product inference API; its OpenCode session uses NVIDIA NIM only as the delegated development agent's own reasoning backend and instructs that agent to preserve the Contextual Orchestrator product boundary.

## Failure handling

- Central reusable scheduler cannot authenticate or inspect the repository: fail closed in that scheduler and do not add a new repository-local credential assumption as a workaround.
- Pull-request inventory cannot be read: fail the workflow visibly. Inventory failure is a workflow failure, not a successful skip.
- Open pull request: stop successfully and allow PR maintenance to finish before new development starts.
- Dry run: print the bounded task contract without reading or requiring the NVIDIA model credential.
- Selected model path lacks `NVIDIA_NIM_API_KEY`: fail the workflow visibly before installing or invoking OpenCode.
- Product or CI failure: perform RCA, test corrective-action feasibility against live capabilities, execute the best bounded feasible remediation, and reverify; do not end at an RCA-only report.
- Preferred remediation is infeasible: preserve the disconfirming evidence and try the next feasible candidate rather than assuming a missing capability.
- Every NVIDIA NIM model candidate fails: discard partial work, fail the run visibly, and propose nothing.
- Required Check or independent review failure: do not merge or release.
- Delayed schedule: rely on the next scheduled run or use a manual dry run; do not add a duplicate scheduler.
- Central merge workflow pin becomes stale: update the immutable pin through a reviewed pull request.

## Disablement

To disable only autonomous product creation, disable `Hourly Product Development` in GitHub Actions or remove its `schedule` event through a pull request. To disable repository-local hourly PR maintenance, disable `Hourly PR Maintenance`; the organization-central event and sweep policies may still process pull requests according to organization policy.

Do not remove `NVIDIA_NIM_API_KEY` as an intentional disablement mechanism. Once deterministic gates select the model path, a missing required credential is an operational failure and remains visible rather than producing a false-green skip.
