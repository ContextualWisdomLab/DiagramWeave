# Isolated Autonomous Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split DiagramWeave's hourly model proposal, deterministic verification, and GitHub publication into separate runner and credential boundaries that exchange only a bounded, hash-bound repository proposal.

**Architecture:** The existing inventory gate remains the source of the exact PR head or protected-main tip. A proposal job receives the NVIDIA credential but no repository write authority, writes a bounded patch bundle, and uploads it as an immutable workflow artifact. A fresh verification job receives neither NVIDIA nor repository write authority, materializes the bundle in a clean checkout, runs the complete repository gate as an isolated operating-system user, verifies that source content did not change during tests, and emits a verification receipt. A fresh publisher job receives repository write authority only after successful verification; it validates the artifact digest and receipt, applies the verified bundle using trusted code with Git hooks and ambient Git configuration disabled, creates exactly one commit, revalidates the live remote ref, and performs only an ordinary push plus PR create/update.

**Tech Stack:** GitHub Actions; Node.js 24; Bash with `set -euo pipefail`; Git 2.5x; JSON Schema Draft 2020-12; `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`; `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`; `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`.

## Global Constraints

- Preserve source-first manual editing and all existing DiagramWeave product boundaries.
- Use `NVIDIA_NIM_API_KEY`; never introduce `COPILOT_GITHUB_TOKEN`.
- Do not change the independent review-agent credential chain.
- Repository write permission exists only in the final publisher job.
- The model and verifier never receive `GH_TOKEN`, `GITHUB_TOKEN`, Actions OIDC request values, or paths to GitHub command files.
- The publisher never executes proposal-controlled tests, scripts, hooks, filters, binaries, or shell fragments.
- A successful model process is not completion evidence; meaningful bounded mutation and deterministic verification are required.
- Preserve 100% production statement, branch, function, and public docstring/JSDoc coverage.
- All action references remain immutable full commit SHAs.
- All database objects, if any are introduced, use descriptive two-word-or-longer `snake_case` names.
- No force-push, branch-protection bypass, manufactured approval, synthetic success, automatic merge, package publication, or release.

---

## File Structure

### Production and workflow files

- Modify: `.github/workflows/hourly-product-development.yml` — four-job orchestration, least-privilege permissions, artifact handoff, exact-ref publication.
- Create: `scripts/hourly-proposal-bundle.mjs` — trusted bundle construction, schema validation, path/mode/size/hash enforcement, materialization, and source-tree hashing.
- Create: `schemas/hourly-proposal-manifest.schema.json` — versioned proposal manifest contract.
- Create: `schemas/hourly-verification-receipt.schema.json` — versioned verification receipt contract.

### Tests

- Create: `tests/hourly-proposal-bundle.test.js` — executable unit and adversarial tests for trusted bundle code.
- Create: `tests/hourly-publication-boundary-contract.test.js` — executable and structural workflow authority tests.
- Modify: `tests/workflow-contract.test.js` — replace single-job assumptions with four-job least-privilege and exact-artifact contracts.
- Modify: `tests/hourly-noop-fallback-contract.test.js` — keep candidate/no-op behavior while pointing to the proposal job's bounded shell step.
- Modify: `scripts/run-coverage.mjs` — include the trusted bundle module in production coverage if the repository's source discovery does not pick it up automatically.

### Durable governance records

- Modify: `docs/adr/0007-automation-authority.md` — accepted cross-job authority and immutable-artifact decision.
- Modify: `docs/security-model.md` — command-file, Git control-plane, detached-process, artifact-tamper, and verifier-source-mutation threats.
- Modify: `docs/THREAT_MODEL.md` — STRIDE rows, mitigations, adversarial tests, and review date.
- Modify: `docs/architecture.md` — proposal/verification/publication UML and trust-boundary diagram.
- Modify: `docs/operations/hourly-development.md` — job contracts, artifact retention, failure handling, and incident diagnosis.
- Modify: `docs/TEST_STRATEGY.md` — executable adversarial boundary matrix.
- Modify: `docs/TRACEABILITY.md` — issue #28, requirements, implementation, and evidence mapping.
- Modify: `CHANGELOG.md` — security behavior under Unreleased.

---

### Task 1: Manifest schemas and trusted bundle RED contracts

**Files:**
- Create: `schemas/hourly-proposal-manifest.schema.json`
- Create: `schemas/hourly-verification-receipt.schema.json`
- Create: `tests/hourly-proposal-bundle.test.js`
- Create: `scripts/hourly-proposal-bundle.mjs`

**Interfaces:**
- Produces `buildProposalBundle(options): Promise<ProposalBundleReceipt>`.
- Produces `validateProposalBundle(options): Promise<ValidatedProposalBundle>`.
- Produces `materializeProposalBundle(options): Promise<void>`.
- Produces `hashSourceTree(options): Promise<string>`.
- CLI subcommands: `build`, `validate`, `materialize`, `hash-tree`, `verify-receipt`.

- [ ] **Step 1: Write the failing manifest-schema tests**

Add tests that import the wished-for module and assert rejection of:

```js
const unsafeManifests = [
  { files: [{ path: '../escape', kind: 'file', mode: '0644' }] },
  { files: [{ path: '.git/config', kind: 'file', mode: '0644' }] },
  { files: [{ path: 'link', kind: 'symlink', mode: '120000' }] },
  { files: [{ path: 'script.sh', kind: 'file', mode: '0777' }] },
];
```

The positive fixture must include:

```json
{
  "schema_version": "1.0.0",
  "repository_full_name": "ContextualWisdomLab/DiagramWeave",
  "base_commit_sha": "0000000000000000000000000000000000000000",
  "execution_mode": "product",
  "files": [
    {
      "kind": "file",
      "mode": "0644",
      "path": "packages/core/src/example.js",
      "sha256": "<64 lowercase hex>",
      "size_bytes": 12
    }
  ],
  "patch_sha256": "<64 lowercase hex>",
  "total_file_count": 1,
  "total_source_bytes": 12
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
node --test tests/hourly-proposal-bundle.test.js
```

Expected: FAIL because `scripts/hourly-proposal-bundle.mjs` and both schemas do not exist.

- [ ] **Step 3: Implement the two strict schemas**

The proposal schema must:

- set `additionalProperties: false` at every object;
- require lowercase SHA-256 and 40-character Git SHA patterns;
- permit only `file` and `deleted` entries;
- permit only `0644` and `0755` file modes;
- reject absolute paths, empty segments, `.`/`..`, `.git`, NUL, backslash, and control characters;
- cap `total_file_count` at 2,048 and `total_source_bytes` at 67,108,864;
- require files sorted by UTF-8 byte order with no duplicates;
- bind `repository_full_name`, exact base SHA, execution mode, patch hash, and source hashes.

The verification receipt schema must bind:

```json
{
  "schema_version": "1.0.0",
  "proposal_artifact_digest": "sha256:<64 lowercase hex>",
  "proposal_manifest_sha256": "<64 lowercase hex>",
  "verified_source_tree_sha256": "<64 lowercase hex>",
  "base_commit_sha": "<40 lowercase hex>",
  "verification_commit_sha": "<40 lowercase hex>",
  "verification_commands": [
    "npm ci --ignore-scripts --no-audit --no-fund",
    "npm run verify",
    "node scripts/check-package-contents.mjs"
  ],
  "source_unchanged_during_verification": true
}
```

- [ ] **Step 4: Implement minimal trusted bundle functions**

Use only Node built-ins. Every public export receives complete JSDoc covering inputs, outputs, exceptions, limits, and trust boundaries. Normalize no path; validate the original POSIX path and fail closed. Read files with `lstat`, reject symbolic links and non-regular files, hash in bounded streams, canonicalize JSON with recursively sorted object keys, and use exclusive temporary files followed by atomic rename.

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
node --test tests/hourly-proposal-bundle.test.js
```

Expected: all focused tests pass with zero warnings.

- [ ] **Step 6: Commit**

```bash
git add schemas/hourly-proposal-manifest.schema.json \
  schemas/hourly-verification-receipt.schema.json \
  scripts/hourly-proposal-bundle.mjs \
  tests/hourly-proposal-bundle.test.js
git commit -m "feat(ci): define bounded proposal artifacts"
```

---

### Task 2: Adversarial bundle behavior and source-tree identity

**Files:**
- Modify: `tests/hourly-proposal-bundle.test.js`
- Modify: `scripts/hourly-proposal-bundle.mjs`

**Interfaces:**
- Consumes the Task 1 exports and CLI.
- Produces deterministic bundle and source-tree hashes used by verification and publication.

- [ ] **Step 1: Add failing adversarial tests**

Create real temporary Git repositories and assert fail-closed behavior for:

- symlinked source file;
- FIFO or device-like non-regular file where supported;
- intermediate-directory symlink;
- duplicate manifest path;
- unsorted manifest path;
- executable mode other than `0755`;
- file changing between `lstat` and hash/read;
- oversized file count and byte budget;
- patch digest mismatch;
- source file digest mismatch;
- manifest digest mismatch;
- proposal artifact digest mismatch;
- modification, deletion, and regular untracked-file round trip;
- source-tree hash equality before and after materialization;
- `PR_MESSAGE.md` metadata extraction without including it as source content;
- literal NVIDIA secret value appearing in patch, manifest, metadata, or source file.

- [ ] **Step 2: Run RED verification**

```bash
node --test tests/hourly-proposal-bundle.test.js
```

Expected: new tests fail on missing race, secret, and tamper checks.

- [ ] **Step 3: Implement minimal protections**

Use file descriptors with pre/post `fstat` identity checks, byte-count limits during streaming, exact digest comparison, and a `forbiddenLiteralValues` option whose nonempty byte strings are searched across every bundle payload before artifact publication. Source-tree hashing must include path, kind, normalized executable bit, size, and content hash while excluding `.git`, dependency/build caches, `opencode.json`, and `PR_MESSAGE.md` according to an explicit allow/deny contract rather than ambient `.gitignore` behavior.

- [ ] **Step 4: Run GREEN plus mutation verification**

```bash
node --test tests/hourly-proposal-bundle.test.js
```

Then deliberately remove the symlink rejection and verify that the relevant test fails; restore it and rerun green.

- [ ] **Step 5: Commit**

```bash
git add scripts/hourly-proposal-bundle.mjs tests/hourly-proposal-bundle.test.js
git commit -m "test(ci): harden proposal artifact boundaries"
```

---

### Task 3: Workflow authority RED contract

**Files:**
- Create: `tests/hourly-publication-boundary-contract.test.js`
- Modify: `tests/workflow-contract.test.js`
- Modify: `tests/hourly-noop-fallback-contract.test.js`

**Interfaces:**
- Defines the exact step/job names consumed by later implementation:
  - `select-work`
  - `propose`
  - `verify-proposal`
  - `publish-verified-proposal`

- [ ] **Step 1: Write failing structural and executable tests**

Assert that the workflow contains four jobs with these permission ceilings:

```yaml
select-work:
  permissions:
    actions: read
    checks: read
    contents: read
    pull-requests: read
    statuses: read

propose:
  permissions:
    contents: read

verify-proposal:
  permissions:
    contents: read

publish-verified-proposal:
  permissions:
    contents: write
    pull-requests: write
```

Also assert:

- no job-level `REPOSITORY_TOKEN` or `github.token` environment;
- only `propose` references `secrets.NVIDIA_NIM_API_KEY`;
- only publisher references `github.token` with write permissions;
- proposal job uploads `proposal-${{ github.run_id }}-${{ github.run_attempt }}` using upload-artifact SHA `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`;
- verifier and publisher download by exact artifact name and digest using download-artifact SHA `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`;
- publisher never contains `npm`, `node scripts/check-package-contents.mjs`, `opencode`, `bash -c` with proposal content, `git add -A`, or proposal-controlled executable invocation;
- publisher uses only trusted `node scripts/hourly-proposal-bundle.mjs` commands and `git commit --no-verify` / `git push --no-verify` with hooks disabled;
- no force push, merge, approval, package publication, or release command.

- [ ] **Step 2: Run RED verification**

```bash
node --test \
  tests/hourly-publication-boundary-contract.test.js \
  tests/workflow-contract.test.js \
  tests/hourly-noop-fallback-contract.test.js
```

Expected: fail because the current workflow is still a single write-capable job.

- [ ] **Step 3: Commit RED tests only**

```bash
git add tests/hourly-publication-boundary-contract.test.js \
  tests/workflow-contract.test.js \
  tests/hourly-noop-fallback-contract.test.js
git commit -m "test(security): require isolated proposal publication"
```

---

### Task 4: Read-only selection and proposal jobs

**Files:**
- Modify: `.github/workflows/hourly-product-development.yml`
- Modify: `tests/hourly-publication-boundary-contract.test.js`

**Interfaces:**
- `select-work` outputs exact mode, PR number, head branch/SHA, base branch/SHA, and dispatch flag.
- `propose` outputs the proposal artifact name, artifact digest, manifest digest, and meaningful-mutation flag.

- [ ] **Step 1: Run the Task 3 tests to preserve RED**

```bash
node --test tests/hourly-publication-boundary-contract.test.js
```

Expected: authority tests fail.

- [ ] **Step 2: Implement `select-work`**

Move inventory and exact-head evidence capture into a read-only job. Validate every output as JSON before writing it to `GITHUB_OUTPUT`. Upload the bounded evidence directory separately only when remediation is selected. Use no checkout for dry-run. Treat inventory failure as job failure, not skip.

- [ ] **Step 3: Implement `propose`**

Use a fresh checkout at the exact selected SHA with `persist-credentials: false`. Download remediation evidence by exact artifact name. Configure OpenCode outside the repository. Lock `GITHUB_WORKSPACE`, `RUNNER_TEMP`, and command-file directories to the runner user; run OpenCode as `diagramweave-agent` with clean `env -i`, isolated HOME/TMP/XDG directories, only the NVIDIA credential, and no GitHub/Actions variables. Kill and verify every process for that user before bundle construction, delete the user, restore trusted `.git` state, and call:

```bash
node scripts/hourly-proposal-bundle.mjs build \
  --repository "$GITHUB_REPOSITORY" \
  --base-sha "$SELECTED_SHA" \
  --execution-mode "$EXECUTION_MODE" \
  --workspace "$GITHUB_WORKSPACE" \
  --output "$RUNNER_TEMP/proposal-bundle" \
  --forbid-literal-env NVIDIA_API_KEY
```

Upload exactly that directory with a one-day retention and `include-hidden-files: false`. Product exhaustion fails; remediation exhaustion emits `mutation=false` and succeeds without an artifact.

- [ ] **Step 4: Run focused GREEN verification**

```bash
node --test \
  tests/hourly-publication-boundary-contract.test.js \
  tests/hourly-noop-fallback-contract.test.js
```

Expected: selection/proposal tests pass; verifier/publisher tests remain red.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/hourly-product-development.yml \
  tests/hourly-publication-boundary-contract.test.js
git commit -m "fix(security): isolate autonomous proposal generation"
```

---

### Task 5: Fresh isolated verification job

**Files:**
- Modify: `.github/workflows/hourly-product-development.yml`
- Modify: `tests/hourly-publication-boundary-contract.test.js`
- Modify: `tests/hourly-proposal-bundle.test.js`

**Interfaces:**
- Consumes proposal artifact and digest from `propose`.
- Produces verified artifact name, verification receipt digest, and verified source-tree hash.

- [ ] **Step 1: Add failing verifier tamper tests**

Require a fresh checkout, no NVIDIA reference, no write permission, separate `diagramweave-verifier` user, command files inaccessible, complete verification commands, before/after source-tree hash equality, process cleanup, and exact verification receipt binding.

- [ ] **Step 2: Run RED verification**

```bash
node --test tests/hourly-publication-boundary-contract.test.js
```

Expected: verifier assertions fail.

- [ ] **Step 3: Implement `verify-proposal`**

Download the proposal artifact by exact name and verify the action-reported artifact digest against `needs.propose.outputs.artifact_digest`. Validate and materialize the bundle into a fresh exact-SHA checkout using trusted code. Run as `diagramweave-verifier` with clean environment:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
node scripts/check-package-contents.mjs
```

The runner user computes source-tree hashes immediately before and after the verifier commands. Any difference fails. Kill and verify verifier processes, delete the user, produce the strict verification receipt, and upload proposal bundle plus receipt as a new `verified-proposal-*` artifact with one-day retention. The verifier cannot write to the repository or call GitHub APIs.

- [ ] **Step 4: Run GREEN verification**

```bash
node --test \
  tests/hourly-publication-boundary-contract.test.js \
  tests/hourly-proposal-bundle.test.js
```

Expected: verifier boundary and tamper tests pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/hourly-product-development.yml \
  scripts/hourly-proposal-bundle.mjs \
  tests/hourly-publication-boundary-contract.test.js \
  tests/hourly-proposal-bundle.test.js
git commit -m "fix(security): verify proposals on a fresh runner"
```

---

### Task 6: Trusted exact-commit publisher

**Files:**
- Modify: `.github/workflows/hourly-product-development.yml`
- Modify: `tests/hourly-publication-boundary-contract.test.js`
- Modify: `tests/hourly-proposal-bundle.test.js`

**Interfaces:**
- Consumes the verified artifact and receipt.
- Produces one ordinary branch update or one new product PR and exact post-push state evidence.

- [ ] **Step 1: Add failing publisher tests**

Prove the publisher:

- downloads only the verifier's artifact;
- checks artifact digest, manifest digest, receipt digest, base SHA, and verified source-tree hash;
- uses a clean exact-SHA checkout;
- rejects any live remote ref movement;
- materializes only manifest-listed files;
- has hooks, system/global Git config, external diff, filters, replace refs, grafts, alternates, and credential helpers disabled;
- stages only manifest paths plus deletions rather than `git add -A`;
- verifies the staged tree hash equals the verified source-tree hash;
- creates one `--no-verify` commit with trusted metadata;
- uses command-scoped masked HTTP authorization for one ordinary `--no-verify` push;
- cannot merge, approve, tag, package-publish, release, or force-push.

- [ ] **Step 2: Run RED verification**

```bash
node --test tests/hourly-publication-boundary-contract.test.js
```

Expected: publisher assertions fail.

- [ ] **Step 3: Implement `publish-verified-proposal`**

Use only trusted bundle CLI commands. Before commit, refetch the exact PR head or default branch tip and compare with the selection output. For product mode, re-query the open PR queue and reject a concurrent PR. Stage the manifest path list explicitly, create one commit, compute its tree, compare against the verified tree, and push the commit SHA to the validated ref. Refetch the PR or created PR and require exact head equality.

- [ ] **Step 4: Run GREEN verification**

```bash
node --test tests/hourly-publication-boundary-contract.test.js
```

Expected: all authority and publisher tests pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/hourly-product-development.yml \
  scripts/hourly-proposal-bundle.mjs \
  tests/hourly-publication-boundary-contract.test.js \
  tests/hourly-proposal-bundle.test.js
git commit -m "fix(security): publish only verified proposal commits"
```

---

### Task 7: End-to-end hostile workflow harness

**Files:**
- Modify: `tests/hourly-publication-boundary-contract.test.js`
- Create: `tests/fixtures/hourly-publication/README.md`

**Interfaces:**
- Executes the trusted bundle CLI and extracted workflow shell fragments without calling live GitHub APIs.

- [ ] **Step 1: Add failing hostile scenarios**

Build temporary repositories and executable fixtures for:

1. model writes `GITHUB_ENV` / `GITHUB_PATH` when paths are discoverable;
2. model installs `.git/hooks/pre-commit` and `pre-push`;
3. model sets `core.hooksPath`, `diff.external`, clean/smudge filters, alternates, replace refs, and credential helper;
4. model leaves a detached process that watches for a token file;
5. proposal contains symlink, FIFO, unsafe path, oversized content, or NVIDIA secret;
6. verifier changes a source file during `npm run verify`;
7. verified artifact or receipt changes before publication;
8. PR head/default branch moves before publication;
9. publisher workspace contains an unrelated untracked file;
10. happy-path remediation and product proposals produce exactly one expected commit.

- [ ] **Step 2: Run RED verification**

```bash
node --test tests/hourly-publication-boundary-contract.test.js
```

Expected: new hostile scenarios expose at least one missing guard.

- [ ] **Step 3: Add the smallest trusted guards**

Modify only trusted bundle logic or workflow authority boundaries. Do not special-case fixture names. Each rejection must emit a fixed source-free reason code.

- [ ] **Step 4: Run GREEN and mutation checks**

Run focused tests, then temporarily remove each high-risk guard one at a time and confirm the corresponding test fails. Restore and rerun green.

- [ ] **Step 5: Commit**

```bash
git add tests/hourly-publication-boundary-contract.test.js \
  tests/fixtures/hourly-publication/README.md \
  scripts/hourly-proposal-bundle.mjs \
  .github/workflows/hourly-product-development.yml
git commit -m "test(security): exercise hostile publication boundaries"
```

---

### Task 8: Coverage, package, and documentation integration

**Files:**
- Modify: `scripts/run-coverage.mjs`
- Modify: `scripts/check-package-contents.mjs` if needed to keep schemas in source distributions only where contractually appropriate.
- Modify: `docs/adr/0007-automation-authority.md`
- Modify: `docs/security-model.md`
- Modify: `docs/THREAT_MODEL.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations/hourly-development.md`
- Modify: `docs/TEST_STRATEGY.md`
- Modify: `docs/TRACEABILITY.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Makes the trusted bundle module part of the repository's complete quality and governance graph.

- [ ] **Step 1: Write failing documentation and coverage contracts**

Extend repository contract tests to require the exact four-plane diagram and the following terms in every relevant authority record: `proposal artifact`, `verification receipt`, `fresh runner`, `source-tree digest`, `token-free verifier`, `trusted publisher`, `hooks disabled`, `command files`, `detached process`, and `artifact tampering`.

- [ ] **Step 2: Run RED verification**

```bash
npm run verify
```

Expected: documentation/coverage contracts fail before records are updated.

- [ ] **Step 3: Update all durable records**

ADR-0007 must record the decision, alternatives rejected, consequences, migration, and review triggers. Architecture must include component and sequence Mermaid diagrams. Threat model must add explicit STRIDE rows and adversarial tests. Operations must document artifact retention, exact failure reasons, replay/incident procedure, queue behavior, and disablement. Traceability must link issue #28, PR, files, tests, and exact-head evidence. CHANGELOG must describe the security behavior, not implementation trivia.

- [ ] **Step 4: Integrate full coverage and docstring gates**

Ensure `scripts/hourly-proposal-bundle.mjs` reaches 100% statement, branch, and function coverage and has complete public JSDoc. Do not exclude trusted error paths.

- [ ] **Step 5: Run GREEN complete verification**

```bash
git diff --check
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
node scripts/check-package-contents.mjs
```

Expected: all tests, 100% production coverage, 100% docstrings, and package contents pass with zero warnings.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md scripts/run-coverage.mjs \
  scripts/check-package-contents.mjs \
  docs/adr/0007-automation-authority.md \
  docs/security-model.md docs/THREAT_MODEL.md docs/architecture.md \
  docs/operations/hourly-development.md docs/TEST_STRATEGY.md \
  docs/TRACEABILITY.md
git commit -m "docs(security): record isolated autonomous publication"
```

---

### Task 9: Workflow syntax, permission, and action-source validation

**Files:**
- Modify: `tests/hourly-publication-boundary-contract.test.js`
- Modify: `tests/workflow-contract.test.js`
- Modify: `.github/workflows/hourly-product-development.yml`

**Interfaces:**
- Final executable policy gate before PR publication.

- [ ] **Step 1: Add failing exact-permission tests**

Assert no implicit write scope, no `secrets: inherit`, no mutable action tag, no job receives both NVIDIA and repository write authority, no `pull_request_target` execution of head code, and every artifact name/digest flows through validated job outputs.

- [ ] **Step 2: Run RED verification**

```bash
node --test tests/hourly-publication-boundary-contract.test.js tests/workflow-contract.test.js
```

Expected: any residual broad authority fails.

- [ ] **Step 3: Apply minimal workflow corrections**

Set top-level `permissions: {}` or `contents: read` according to the exact reusable-workflow constraints and declare every job permission explicitly. Keep `concurrency.cancel-in-progress: false` so a newer run cannot interrupt a publisher after exact-ref revalidation; stale publication remains guarded by live ref comparison.

- [ ] **Step 4: Run complete GREEN verification**

```bash
git diff --check
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
node scripts/check-package-contents.mjs
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/hourly-product-development.yml \
  tests/hourly-publication-boundary-contract.test.js \
  tests/workflow-contract.test.js
git commit -m "test(ci): lock autonomous workflow authority"
```

---

### Task 10: Exact-head review candidate and operational acceptance

**Files:**
- Modify: PR body only after the branch is pushed.
- No production file changes unless exact-head review identifies a valid defect.

**Interfaces:**
- Produces one draft PR linked to issue #28 and the exact evidence needed for protected integration.

- [ ] **Step 1: Rebase or restack on the integrated PR #26 main tip**

After PR #26 merges, reconstruct the branch on the new protected `main` without carrying temporary one-shot workflows or predecessor artifacts.

- [ ] **Step 2: Run fresh complete local verification**

```bash
git diff --check
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
node scripts/check-package-contents.mjs
```

Record exact test counts, all four coverage dimensions, docstring count, package count, and current head SHA.

- [ ] **Step 3: Open one draft PR closing issue #28**

The body must include threat-model delta, RED/ GREEN commits and run IDs, exact action SHAs, permissions table, artifact/receipt contract, adversarial evidence, residual risk, rollback, and operational acceptance steps. Do not represent queued or predecessor-head Checks as success.

- [ ] **Step 4: Process every current-head review and Check**

For each human, CodeRabbit, Advanced Security, Dependabot, Strix, OpenCode, Noema, Semgrep, CodeQL, or other finding: validate against current source, reproduce valid findings test-first, fix minimally, resolve only addressed threads, and rerun exact-head verification.

- [ ] **Step 5: Merge only through repository policy**

Merge only after exact-head required workflows and ruleset evaluation permit it. Never bypass or manufacture approval.

- [ ] **Step 6: Run protected-main operational acceptance**

Manually or on schedule prove:

1. no-open-PR product mode produces a proposal artifact, fresh verifier receipt, and one PR;
2. open-PR remediation with all model candidates failing leaves the exact head unchanged without a branch or commit;
3. a valid remediation publishes one ordinary exact commit to the existing branch;
4. stale-head races fail before publication;
5. model/verifier command-file, hook, process, artifact, and source-mutation attacks fail closed;
6. publisher logs and receipts contain no repository token, NVIDIA secret, source content, or unsafe path.

Record protected-main run IDs and exact SHAs in operations and traceability evidence before issue #28 is closed.

---

## Self-Review

### Spec coverage

- Separate proposal, verifier, and publisher runners: Tasks 3–6.
- Least privilege and no mixed NVIDIA/write authority: Tasks 3, 4, 9.
- Bounded regular-file artifact and manifest: Tasks 1, 2.
- Source-tree identity and no mutation during verification: Tasks 2, 5.
- Trusted publisher only: Task 6.
- Command-file poisoning, Git control-plane persistence, detached process, secret exfiltration, stale races, and tampering: Task 7.
- ADR, architecture/UML, threat model, testing, operability, traceability, and CHANGELOG: Task 8.
- Full coverage/docstrings/package gates: Tasks 8–9.
- Exact-head review and protected-main acceptance: Task 10.

### Placeholder scan

The plan contains no `TBD`, unresolved template token, deferred validation instruction, or unnamed implementation step. Every task identifies exact files, commands, expected RED/GREEN behavior, and commit scope.

### Type and name consistency

The proposal manifest, verification receipt, four job names, trusted bundle exports, artifact names, hashes, and source-tree identity flow are consistent across all tasks.
