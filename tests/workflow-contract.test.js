import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

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
  assert.match(workflow, /^permissions:\n  contents: read$/m);
});

test('product-development automation fails closed until an immutable gateway release is consumed', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /^name: Hourly Product Development$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^  schedule:$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /ContextualWisdomLab\/contextual-orchestrator#1023/);
  assert.match(workflow, /immutable release/i);
  assert.match(workflow, /orchestrator\/free/);
  assert.match(workflow, /exit 1/);

  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
  assert.doesNotMatch(workflow, /NVIDIA_(?:NIM_)?API_KEY/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|OPENROUTER_API_KEY|BYTEZ_API_KEY/);
  assert.doesNotMatch(workflow, /integrate\.api\.nvidia\.com/);
  assert.doesNotMatch(workflow, /nvidia-nim\//);
  assert.doesNotMatch(workflow, /OPENCODE_MODEL_CANDIDATES/);
  assert.doesNotMatch(workflow, /gh pr create|git push|git commit|git reset --hard/);
});

test('hourly operations guide records the disabled consumer boundary', async () => {
  const guide = await readRepositoryFile('docs/operations/hourly-development.md');

  assert.match(guide, /Hourly PR Maintenance/);
  assert.match(guide, new RegExp(centralWorkflowRevision));
  assert.match(guide, /Hourly Product Development/);
  assert.match(guide, /manual dispatch only/i);
  assert.match(guide, /ContextualWisdomLab\/contextual-orchestrator#1023/);
  assert.match(guide, /zero GitHub Releases/i);
  assert.match(guide, /fail(?:s)? closed/i);
  assert.match(guide, /provider credentials/i);
  assert.match(guide, /orchestrator\/free/);
  assert.match(guide, /default model timeout remains null/i);
});
