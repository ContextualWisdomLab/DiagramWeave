import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryName = 'ContextualWisdomLab/DiagramWeave';
const centralWorkflowRevision = '3f65dbee6672b78802e7d71d49c390f3817bb03b';

async function readRepositoryFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('hourly PR maintenance uses only the pinned reusable governance workflow', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-pr-maintenance.yml',
  );

  assert.match(workflow, /^name: Hourly PR Maintenance$/m);
  assert.match(workflow, /cron: ["']13 \* \* \* \*['"]/);
  assert.match(workflow, /group: hourly-pr-maintenance-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /CWL_AUTOMATION_TOKEN/);
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

test('hourly product development fails closed and proposes one bounded NIM increment', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /^name: Hourly Product Development$/m);
  assert.match(workflow, /cron: ["']47 \* \* \* \*["']/);
  assert.match(workflow, /group: hourly-product-development-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, new RegExp(`github\\.repository == '${repositoryName}'`));
  assert.match(workflow, /NVIDIA_API_KEY: \$\{\{ secrets\.NVIDIA_NIM_API_KEY \}\}/);
  assert.match(workflow, /gh pr list/);
  assert.match(workflow, /--state open/);
  assert.match(workflow, /reason=open_pull_request/);
  assert.match(workflow, /reason=pull_request_inventory_unavailable/);
  assert.match(workflow, /reason=nim_api_key_unavailable/);
  assert.match(workflow, /https:\/\/integrate\.api\.nvidia\.com\/v1/);
  assert.match(workflow, /\{env:NVIDIA_API_KEY\}/);
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
  assert.doesNotMatch(workflow, /COPILOT_GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /\/agents\/repos\//);
  assert.doesNotMatch(workflow, /gh pr merge/);
});

test('hourly operations guide documents activation, credentials, and disablement', async () => {
  const guide = await readRepositoryFile('docs/operations/hourly-development.md');

  assert.match(guide, /default branch/i);
  assert.match(guide, /No repository-specific secret is required/i);
  assert.match(guide, /does not require a separate repository-dispatch credential/i);
  assert.match(guide, /NVIDIA_NIM_API_KEY/);
  assert.match(guide, /OpenCode/);
  assert.match(guide, /dry run/i);
  assert.match(guide, /fail(?:s)? closed/i);
  assert.match(guide, /schedule.*delay|delay.*schedule/is);
  assert.match(guide, /disable/i);
  assert.match(guide, new RegExp(centralWorkflowRevision));
  assert.match(guide, /Contextual Orchestrator/i);
});
