import assert from 'node:assert/strict';
import test from 'node:test';

import {
  finalWorkflowStep,
  readRepositoryFile,
  workflowStep,
} from './helpers/repository-contract.js';

const repositoryName = 'ContextualWisdomLab/DiagramWeave';
const centralWorkflowRevision = '3f65dbee6672b78802e7d71d49c390f3817bb03b';

test('hourly PR maintenance uses only the pinned reusable governance workflow', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-pr-maintenance.yml',
  );

  assert.match(workflow, /^name: Hourly PR Maintenance$/m);
  assert.match(workflow, /cron: ["']13 \* \* \* \*["']/);
  assert.match(workflow, /group: hourly-pr-maintenance-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /CWL_AUTOMATION_TOKEN/);
  assert.doesNotMatch(workflow, /CENTRAL_DISPATCH_TOKEN/);
  assert.doesNotMatch(workflow, /central_dispatch_token_unavailable/);
  assert.doesNotMatch(workflow, /repos\/ContextualWisdomLab\/\.github\/dispatches/);
  assert.doesNotMatch(workflow, /dispatch-review-fix:/);
  assert.doesNotMatch(workflow, /secrets:\s*inherit/);
  assert.match(
    workflow,
    new RegExp(
      `ContextualWisdomLab/\\.github/\\.github/workflows/pr-review-merge-scheduler\\.yml@${centralWorkflowRevision}`,
    ),
  );
  assert.doesNotMatch(workflow, /pr-review-merge-scheduler\.yml@main/);
  assert.match(workflow, /review_dispatch_limit: ["']1["']/);
  assert.match(workflow, /branch_update_limit: ["']1["']/);
  assert.match(workflow, /merge_mode: ["']direct_or_auto["']/);
  assert.match(workflow, /enable_auto_merge: true/);
  assert.match(workflow, /update_branches: true/);
  assert.match(workflow, /trigger_reviews: true/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(
    workflow,
    /review-merge:[\s\S]*?permissions:\n      actions: write\n      checks: read\n      contents: write\n      id-token: write\n      pull-requests: write\n      statuses: read/,
  );
});

test('hourly development performs RCA remediation or one bounded gateway-routed product increment', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /^name: Hourly Product Development$/m);
  assert.match(workflow, /cron: ["']47 \* \* \* \*["']/);
  assert.match(workflow, /group: hourly-product-development-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, new RegExp(`github\\.repository == '${repositoryName}'`));
  assert.match(workflow, /BYTEZ_API_KEY: \$\{\{ secrets\.BYTEZ_API_KEY \}\}/);
  assert.match(workflow, /NVIDIA_NIM_API_KEY: \$\{\{ secrets\.NVIDIA_NIM_API_KEY \}\}/);
  assert.match(workflow, /NVIDIA_NIM_API_KEY_SUB: \$\{\{ secrets\.NVIDIA_NIM_API_KEY_SUB \}\}/);
  assert.match(workflow, /OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/);
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /gh pr list/);
  assert.match(workflow, /--state open/);
  assert.match(workflow, /reason=open_pull_request_remediation/);
  assert.match(workflow, /reason=pull_request_inventory_unavailable/);
  assert.match(workflow, /reason=orchestrator_credential_unavailable/);
  assert.match(workflow, /ContextualWisdomLab\/contextual-orchestrator\.git/);
  assert.match(workflow, /ORCHESTRATOR_PIN_SHA: ["']045d17da5e2aea56a97e241ee158ab1628d78660["']/);
  assert.match(workflow, /--require-hashes/);
  assert.match(workflow, /--auto-discover-model-agents/);
  assert.match(workflow, /scripts\.ci\.serve_seeded_gateway/);
  assert.match(workflow, /contextual_orchestrator_gateway\/orchestrator\/free/);
  assert.match(workflow, /\{env:CONTEXTUAL_ORCHESTRATOR_TOKEN\}/);
  assert.doesNotMatch(workflow, /integrate\.api\.nvidia\.com/);
  assert.doesNotMatch(workflow, /nvidia-nim\/nvidia\//);
  assert.doesNotMatch(workflow, /enabled_providers/);
  assert.doesNotMatch(workflow, /OPENCODE_MODEL_CANDIDATES/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /env -u GH_TOKEN -u GITHUB_TOKEN -u REPOSITORY_TOKEN/);
  assert.match(workflow, /OPENCODE_VERSION: ["']1\.17\.13["']/);
  assert.match(workflow, /sha256sum -c -/);
  assert.match(workflow, /gh pr create/);
  assert.match(workflow, /exactly one bounded pull request/i);
  assert.match(workflow, /ContextualWisdomLab\/contextual-orchestrator/);
  assert.match(workflow, /source-first/i);
  assert.match(workflow, /manual editing/i);
  assert.match(workflow, /100% production statement and branch coverage/i);
  assert.match(workflow, /100% production function and docstring coverage/i);
  assert.match(workflow, /two-word-or-longer snake_case/i);
  assert.match(workflow, /modular MSA/i);
  assert.match(workflow, /ContextualWisdomLab\/\.github/);
  assert.match(workflow, /naruon/i);
  assert.match(workflow, /APA 7/i);
  assert.match(workflow, /Figma or Product Design/i);
  assert.match(workflow, /Do not merge, publish, release, or bypass/i);
  assert.match(workflow, /CHANGELOG\.md/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /check-package-contents\.mjs/);
  assert.doesNotMatch(workflow, /COPILOT_GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /\/agents\/repos\//);
  assert.doesNotMatch(workflow, /gh pr merge/);
  assert.doesNotMatch(workflow, /--force(?:-with-lease)?/);
  assert.doesNotMatch(
    workflow,
    /https:\/\/x-access-token:\$\{GH_TOKEN\}@github\.com/,
  );
  assert.equal((workflow.match(/GIT_CONFIG_COUNT=1/g) ?? []).length, 2);
  assert.equal(
    (
      workflow.match(
        /GIT_CONFIG_KEY_0=http\.https:\/\/github\.com\/\.extraheader/g,
      ) ?? []
    ).length,
    2,
  );
});

test('hourly gate fails closed, preserves dry-run isolation, and selects exact-head work', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );
  const gate = workflowStep(
    workflow,
    'Select remediation or product-development mode',
    'Check out the selected exact revision without persisted credentials',
  );

  const inventoryReason = gate.indexOf('reason=pull_request_inventory_unavailable');
  assert.notEqual(inventoryReason, -1);
  const inventoryEnd = gate.indexOf('\n          fi', inventoryReason);
  assert.notEqual(inventoryEnd, -1);
  const inventoryFailure = gate.slice(inventoryReason, inventoryEnd);
  assert.match(inventoryFailure, /exit 1/);
  assert.doesNotMatch(inventoryFailure, /exit 0/);
  assert.doesNotMatch(gate, /NVIDIA_(?:NIM_)?API_KEY/);
  assert.match(gate, /jq -e 'type == "array"'/);
  assert.match(gate, /isCrossRepository/);
  assert.match(gate, /statusCheckRollup/);
  assert.match(gate, /reason=dry_run/);
  assert.match(gate, /reason=ready/);
  assert.match(gate, /reason=open_pull_request_remediation/);
  assert.match(gate, /reason=cross_repository_pull_request_only/);
  assert.match(gate, /mode=product/);
  assert.match(gate, /mode=remediation/);
  assert.match(gate, /target_pr_number=/);
  assert.match(gate, /target_head_branch=/);
  assert.match(gate, /target_head_sha=/);
  assert.match(gate, /target_base_branch=/);
  assert.match(gate, /checkout_ref=/);

  const jobStart = workflow.indexOf('  dispatch-product-gap:\n');
  const stepsStart = workflow.indexOf('    steps:\n', jobStart);
  assert.ok(jobStart >= 0 && stepsStart > jobStart);
  assert.doesNotMatch(
    workflow.slice(jobStart, stepsStart),
    /secrets\.(BYTEZ_API_KEY|NVIDIA_NIM_API_KEY|NVIDIA_NIM_API_KEY_SUB|OPENROUTER_API_KEY|OPENAI_API_KEY)/,
  );

  const checkout = workflowStep(
    workflow,
    'Check out the selected exact revision without persisted credentials',
    'Collect live exact-head pull-request evidence',
  );
  assert.match(checkout, /ref: \$\{\{ steps\.gate\.outputs\.checkout_ref \}\}/);
  assert.match(checkout, /fetch-depth: 0/);
  assert.match(checkout, /persist-credentials: false/);

  const evidence = workflowStep(
    workflow,
    'Collect live exact-head pull-request evidence',
    'Prepare bounded commercial-quality task',
  );
  assert.match(evidence, /expected_head_sha/);
  assert.match(evidence, /remote_head_sha/);
  assert.match(evidence, /reviewThreads/);
  assert.match(evidence, /check-runs/);
  assert.match(evidence, /commit-status/);
  assert.match(evidence, /workflow-runs/);
  assert.match(evidence, /failed-run-logs/);

  const prepare = workflowStep(
    workflow,
    'Prepare bounded commercial-quality task',
    'Record dry-run decision',
  );
  assert.match(
    prepare,
    /steps\.gate\.outputs\.dispatch == 'true' \|\| steps\.gate\.outputs\.reason == 'dry_run'/,
  );
  assert.match(prepare, /root-cause analysis/i);
  assert.match(prepare, /candidate corrective actions/i);
  assert.match(prepare, /verify each action's feasibility/i);
  assert.match(prepare, /live exact-head evidence/i);

  const dryRunStep = workflowStep(
    workflow,
    'Record dry-run decision',
    'Require at least one contextual-orchestrator provider credential',
  );
  assert.match(dryRunStep, /steps\.gate\.outputs\.reason == 'dry_run'/);

  const credentialStep = workflowStep(
    workflow,
    'Require at least one contextual-orchestrator provider credential',
    'Install the pinned OpenCode CLI',
  );
  assert.match(credentialStep, /if: steps\.gate\.outputs\.dispatch == 'true'/);
  assert.match(
    credentialStep,
    /NVIDIA_NIM_API_KEY: \$\{\{ secrets\.NVIDIA_NIM_API_KEY \}\}/,
  );
  assert.match(credentialStep, /provider_secret_count/);
  assert.match(credentialStep, /reason=orchestrator_credential_unavailable/);
  assert.match(credentialStep, /exit 1/);

  const vendorStep = workflowStep(
    workflow,
    'Vendor the contextual-orchestrator gateway',
    'Start the contextual-orchestrator gateway with auto-discovery',
  );
  assert.match(vendorStep, /ORCHESTRATOR_PIN_SHA/);
  assert.match(vendorStep, /--require-hashes/);

  const gatewayStep = workflowStep(
    workflow,
    'Start the contextual-orchestrator gateway with auto-discovery',
    'Point OpenCode at the local gateway',
  );
  assert.match(
    gatewayStep,
    /NVIDIA_NIM_API_KEY: \$\{\{ secrets\.NVIDIA_NIM_API_KEY \}\}/,
  );
  assert.match(gatewayStep, /CONTEXTUAL_ORCHESTRATOR_TOKEN/);
  assert.match(gatewayStep, /healthz/);

  const modelStep = workflowStep(
    workflow,
    'Run the gateway-routed development agent',
    'Set up Node.js for exact repository verification',
  );
  assert.match(
    modelStep,
    /opencode run "\$prompt" --model contextual_orchestrator_gateway\/orchestrator\/free/,
  );
  assert.doesNotMatch(modelStep, /secrets\./);

  const publish = finalWorkflowStep(workflow, 'Publish one bounded mutation');
  assert.match(publish, /remote_head_sha/);
  assert.match(publish, /HEAD:refs\/heads\/\$\{target_head_branch\}/);
  assert.match(publish, /A pull request appeared after the gate/);
  assert.match(publish, /git_auth_header/);
  assert.match(publish, /GIT_CONFIG_VALUE_0="\$git_auth_header"/);
  assert.doesNotMatch(publish, /https:\/\/x-access-token:/);
  assert.doesNotMatch(publish, /Only PR metadata was produced/);
  assert.doesNotMatch(publish, /--force(?:-with-lease)?/);
});

test('hourly operations guide documents realistic RCA, credentials, and disablement', async () => {
  const guide = await readRepositoryFile('docs/operations/hourly-development.md');

  assert.match(guide, /default branch/i);
  assert.match(guide, /No repository-specific secret is required/i);
  assert.match(guide, /does not require a separate repository-dispatch credential/i);
  assert.match(guide, /NVIDIA_NIM_API_KEY/);
  assert.match(guide, /OpenCode/);
  assert.match(guide, /dry run/i);
  assert.match(guide, /dry run[^.]*does not require[^.]*NVIDIA_NIM_API_KEY/is);
  assert.match(guide, /Inventory failure is a workflow failure, not a successful skip/i);
  assert.match(guide, /root-cause analysis/i);
  assert.match(guide, /candidate corrective actions/i);
  assert.match(guide, /feasibility/i);
  assert.match(guide, /exact current head/i);
  assert.match(guide, /re-fetch/i);
  assert.match(guide, /independent approval cannot be manufactured/i);
  assert.match(guide, /queued or pending Checks cannot be declared successful/i);
  assert.match(guide, /next safe, non-conflicting activity/i);
  assert.match(guide, /no duplicate pull request/i);
  assert.match(guide, /fail(?:s)? closed/i);
  assert.match(guide, /schedule.*delay|delay.*schedule/is);
  assert.match(guide, /disable/i);
  assert.match(guide, new RegExp(centralWorkflowRevision));
  assert.match(guide, /Contextual Orchestrator/i);
});
