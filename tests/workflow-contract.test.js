import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryName = 'ContextualWisdomLab/DiagramWeave';
const centralWorkflowRevision = '3f65dbee6672b78802e7d71d49c390f3817bb03b';

async function readRepositoryFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('hourly PR maintenance securely dispatches repair and pins merge governance', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-pr-maintenance.yml',
  );

  assert.match(workflow, /^name: Hourly PR Maintenance$/m);
  assert.match(workflow, /cron: ["']13 \* \* \* \*["']/);
  assert.match(workflow, /group: hourly-pr-maintenance-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /CWL_AUTOMATION_TOKEN/);
  assert.match(workflow, /reason=central_dispatch_token_unavailable/);
  assert.match(
    workflow,
    /api\.github\.com\/repos\/ContextualWisdomLab\/\.github\/dispatches/,
  );
  assert.match(workflow, /pr-review-fix-scheduler/);
  assert.match(workflow, new RegExp(`target_repository.*${repositoryName}`, 's'));
  assert.match(workflow, /base_branch.*main/s);
  assert.match(workflow, /retry_hours.*1/s);
  assert.match(workflow, /max_dispatches.*1/s);
  assert.match(workflow, /X-GitHub-Api-Version: 2022-11-28/);
  assert.doesNotMatch(
    workflow,
    /uses: ContextualWisdomLab\/\.github\/\.github\/workflows\/pr-review-fix-scheduler/,
  );
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
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /contents: write/);
});

test('hourly product development fails closed and creates one bounded agent task', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /^name: Hourly Product Development$/m);
  assert.match(workflow, /cron: ["']47 \* \* \* \*["']/);
  assert.match(workflow, /group: hourly-product-development-\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, new RegExp(`github\\.repository == '${repositoryName}'`));
  assert.match(workflow, /COPILOT_GITHUB_TOKEN/);
  assert.match(workflow, /gh pr list/);
  assert.match(workflow, /--state open/);
  assert.match(workflow, /reason=open_pull_request/);
  assert.match(workflow, /reason=agent_task_token_unavailable/);
  assert.match(workflow, /reason=task_inventory_unavailable/g);
  assert.match(workflow, /unexpected schema/i);
  assert.match(workflow, /active or in an unknown state/i);
  assert.match(workflow, /\/agents\/repos\/\$\{GITHUB_REPOSITORY\}\/tasks\?per_page=100/);
  assert.match(workflow, /X-GitHub-Api-Version: 2026-03-10/);
  assert.match(workflow, /completed/);
  assert.match(workflow, /failed/);
  assert.match(workflow, /timed_out/);
  assert.match(workflow, /cancelled/);
  assert.match(workflow, /create_pull_request: true/);
  assert.match(workflow, /base_ref: \$base/);
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
  assert.doesNotMatch(workflow, /AGENT_TASK_TOKEN: \$\{\{ github\.token \}\}/);
});

test('hourly operations guide documents activation, credentials, and disablement', async () => {
  const guide = await readRepositoryFile('docs/operations/hourly-development.md');

  assert.match(guide, /default branch/i);
  assert.match(guide, /COPILOT_GITHUB_TOKEN/);
  assert.match(guide, /Agent tasks.*read\/write/is);
  assert.match(guide, /public preview/i);
  assert.match(guide, /dry run/i);
  assert.match(guide, /fail(?:s)? closed/i);
  assert.match(guide, /schedule.*delay|delay.*schedule/is);
  assert.match(guide, /disable/i);
  assert.match(guide, new RegExp(centralWorkflowRevision));
  assert.match(guide, /Contextual Orchestrator/i);
});
