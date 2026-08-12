import assert from 'node:assert/strict';
import test from 'node:test';

import {
  finalWorkflowStep,
  readRepositoryFile,
} from './helpers/repository-contract.js';

test('hourly development routes open pull requests into exact-head remediation', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /Select remediation or product-development mode/);
  assert.match(workflow, /--json[^\n]*headRefName[^\n]*headRefOid/);
  assert.match(workflow, /isCrossRepository/);
  assert.match(workflow, /reason=open_pull_request_remediation/);
  assert.match(workflow, /mode=remediation/);
  assert.match(workflow, /target_pr_number=/);
  assert.match(workflow, /target_head_branch=/);
  assert.match(workflow, /target_head_sha=/);
  assert.match(workflow, /target_base_branch=/);
  assert.doesNotMatch(
    workflow,
    /reason=open_pull_request[\s\S]{0,300}dispatch=false/,
  );
  assert.match(workflow, /ref: \$\{\{ steps\.gate\.outputs\.checkout_ref \}\}/);
  assert.match(workflow, /expected_head_sha/);
  assert.match(workflow, /remote_head_sha/);

  const publish = finalWorkflowStep(workflow, 'Publish one bounded mutation');
  assert.match(publish, /git push/);
  assert.match(publish, /HEAD:refs\/heads\/\$\{target_head_branch\}/);
  assert.doesNotMatch(publish, /--force(?:-with-lease)?/);
});

test('hourly agent performs RCA, checks feasibility, acts, and verifies outcome', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /root-cause analysis/i);
  assert.match(workflow, /candidate corrective actions/i);
  assert.match(workflow, /verify each action's feasibility/i);
  assert.match(workflow, /live exact-head evidence/i);
  assert.match(workflow, /permissions, repository policy, and side effects/i);
  assert.match(workflow, /execute every safe, policy-compliant, feasible action/i);
  assert.match(workflow, /re-fetch the affected\s+state/i);
  assert.match(workflow, /approval or Check latency is not itself\s+a reason to stop/i);
  assert.match(workflow, /never manufacture approval/i);
  assert.match(workflow, /do not\s+create a duplicate pull request/i);
  assert.match(workflow, /no safe mutation can improve the blocker/i);
});
