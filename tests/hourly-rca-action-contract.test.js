import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readRepositoryFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

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
  assert.match(
    workflow,
    /git push[\s\S]*HEAD:refs\/heads\/\$\{target_head_branch\}/i,
  );
  assert.doesNotMatch(workflow, /--force(?:-with-lease)?/);
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

test('hourly operations guide defines realistic RCA and continuation behavior', async () => {
  const guide = await readRepositoryFile('docs/operations/hourly-development.md');

  assert.match(guide, /root-cause analysis/i);
  assert.match(guide, /candidate corrective actions/i);
  assert.match(guide, /feasibility/i);
  assert.match(guide, /exact current head/i);
  assert.match(guide, /re-fetch/i);
  assert.match(guide, /independent approval cannot be manufactured/i);
  assert.match(guide, /queued or pending Checks cannot be declared successful/i);
  assert.match(guide, /next safe, non-conflicting activity/i);
  assert.match(guide, /no duplicate pull request/i);
});
