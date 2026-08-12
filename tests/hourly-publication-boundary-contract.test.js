import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

const workflowPath = '.github/workflows/hourly-product-development.yml';
const uploadArtifactRevision =
  '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const downloadArtifactRevision =
  '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c';

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `${jobName} job must exist`);
  const nextJobMatch = /^  [a-z0-9-]+:\n/gm;
  nextJobMatch.lastIndex = start + marker.length;
  const nextMatch = nextJobMatch.exec(workflow);
  const end = nextMatch?.index ?? workflow.length;
  return workflow.slice(start, end);
}

function jobHeader(job) {
  const stepsIndex = job.indexOf('    steps:\n');
  assert.notEqual(stepsIndex, -1, 'job must contain steps');
  return job.slice(0, stepsIndex);
}

function assertExactPermissions(job, expectedLines) {
  const header = jobHeader(job);
  const permissionsStart = header.indexOf('    permissions:\n');
  assert.notEqual(permissionsStart, -1, 'job permissions must be explicit');
  const permissionLines = header
    .slice(permissionsStart + '    permissions:\n'.length)
    .split('\n')
    .filter((line) => line.startsWith('      '))
    .map((line) => line.trim())
    .toSorted();
  assert.deepEqual(permissionLines, expectedLines.toSorted());
}

test('hourly automation separates selection proposal verification and publication authority', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const selectWork = workflowJob(workflow, 'select-work');
  const propose = workflowJob(workflow, 'propose');
  const verifyProposal = workflowJob(workflow, 'verify-proposal');
  const publish = workflowJob(workflow, 'publish-verified-proposal');

  assertExactPermissions(selectWork, [
    'actions: read',
    'checks: read',
    'contents: read',
    'pull-requests: read',
    'statuses: read',
  ]);
  assertExactPermissions(propose, ['contents: read']);
  assertExactPermissions(verifyProposal, ['contents: read']);
  assertExactPermissions(publish, [
    'contents: write',
    'pull-requests: write',
  ]);

  assert.doesNotMatch(workflow, /^\s+REPOSITORY_TOKEN:/m);
  assert.doesNotMatch(jobHeader(workflowJob(workflow, 'select-work')), /github\.token/);
  assert.doesNotMatch(jobHeader(propose), /github\.token/);
  assert.doesNotMatch(jobHeader(verifyProposal), /github\.token/);
  assert.doesNotMatch(jobHeader(publish), /NVIDIA_NIM_API_KEY/);
});

test('proposal job owns NVIDIA reasoning but no GitHub publication capability', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const propose = workflowJob(workflow, 'propose');

  assert.match(
    propose,
    /NVIDIA_API_KEY: \$\{\{ secrets\.NVIDIA_NIM_API_KEY \}\}/,
  );
  assert.doesNotMatch(
    propose,
    /GH_TOKEN|GITHUB_TOKEN|REPOSITORY_TOKEN|ACTIONS_ID_TOKEN_REQUEST/,
  );
  assert.match(propose, /persist-credentials: false/);
  assert.match(propose, /env -i/);
  assert.match(propose, /diagramweave-agent/);
  assert.match(propose, /pkill -KILL -u "\$agent_user"/);
  assert.match(propose, /pgrep -u "\$agent_user"/);
  assert.match(propose, /node scripts\/hourly-proposal-bundle\.mjs build/);
  assert.match(
    propose,
    new RegExp(`actions/upload-artifact@${uploadArtifactRevision}`),
  );
  assert.match(
    propose,
    /proposal-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(propose, /retention-days: 1/);
  assert.match(propose, /include-hidden-files: false/);
  assert.doesNotMatch(propose, /git push|gh pr create|gh pr merge|gh pr review/);
});

test('fresh verifier has no model or repository-write credential and binds source identity', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const verifier = workflowJob(workflow, 'verify-proposal');

  assert.doesNotMatch(
    verifier,
    /NVIDIA_NIM_API_KEY|NVIDIA_API_KEY|GH_TOKEN|GITHUB_TOKEN|REPOSITORY_TOKEN|github\.token/,
  );
  assert.match(verifier, /persist-credentials: false/);
  assert.match(
    verifier,
    new RegExp(`actions/download-artifact@${downloadArtifactRevision}`),
  );
  assert.match(verifier, /node scripts\/hourly-proposal-bundle\.mjs validate/);
  assert.match(verifier, /node scripts\/hourly-proposal-bundle\.mjs materialize/);
  assert.match(verifier, /node scripts\/hourly-proposal-bundle\.mjs hash-tree/);
  assert.match(verifier, /diagramweave-verifier/);
  assert.match(verifier, /env -i/);
  assert.match(verifier, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(verifier, /npm run verify/);
  assert.match(verifier, /node scripts\/check-package-contents\.mjs/);
  assert.match(verifier, /source_unchanged_during_verification/);
  assert.match(verifier, /verified_source_tree_sha256/);
  assert.match(
    verifier,
    new RegExp(`actions/upload-artifact@${uploadArtifactRevision}`),
  );
  assert.doesNotMatch(verifier, /git push|gh pr create|gh pr merge|gh pr review/);
});

test('publisher materializes only verified artifacts and never executes proposal code', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const publish = workflowJob(workflow, 'publish-verified-proposal');

  assert.match(publish, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    publish,
    new RegExp(`actions/download-artifact@${downloadArtifactRevision}`),
  );
  assert.match(publish, /node scripts\/hourly-proposal-bundle\.mjs verify-receipt/);
  assert.match(publish, /node scripts\/hourly-proposal-bundle\.mjs materialize/);
  assert.match(publish, /core\.hooksPath=\/dev\/null/);
  assert.match(publish, /git commit --no-verify/);
  assert.match(publish, /git push --no-verify/);
  assert.doesNotMatch(publish, /git add -A/);
  assert.doesNotMatch(publish, /npm(?:\s|$)|opencode|NVIDIA_(?:NIM_)?API_KEY/);
  assert.doesNotMatch(
    publish,
    /--force(?:-with-lease)?|gh pr merge|gh pr review|npm publish|gh release|git tag/,
  );
});

test('artifact names and digests flow through explicit validated job outputs', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const propose = workflowJob(workflow, 'propose');
  const verifier = workflowJob(workflow, 'verify-proposal');
  const publish = workflowJob(workflow, 'publish-verified-proposal');

  for (const outputName of [
    'artifact_name',
    'artifact_digest',
    'manifest_sha256',
    'mutation',
  ]) {
    assert.match(propose, new RegExp(`${outputName}=`));
    assert.match(verifier, new RegExp(`needs\\.propose\\.outputs\\.${outputName}`));
  }
  for (const outputName of [
    'verified_artifact_name',
    'verified_artifact_digest',
    'verification_receipt_sha256',
    'verified_source_tree_sha256',
  ]) {
    assert.match(verifier, new RegExp(`${outputName}=`));
    assert.match(
      publish,
      new RegExp(`needs\\.verify-proposal\\.outputs\\.${outputName}`),
    );
  }
});
