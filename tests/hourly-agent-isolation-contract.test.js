import assert from 'node:assert/strict';
import test from 'node:test';

import {
  finalWorkflowStep,
  readRepositoryFile,
  workflowStep,
} from './helpers/repository-contract.js';

const workflowPath = '.github/workflows/hourly-product-development.yml';

test('repository authority is step-scoped and absent from the model job environment', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const jobStart = workflow.indexOf('  dispatch-product-gap:\n');
  const stepsStart = workflow.indexOf('    steps:\n', jobStart);
  assert.ok(jobStart >= 0 && stepsStart > jobStart);

  const jobHeader = workflow.slice(jobStart, stepsStart);
  assert.doesNotMatch(jobHeader, /REPOSITORY_TOKEN/);
  assert.doesNotMatch(jobHeader, /github\.token/);
  assert.doesNotMatch(workflow, /REPOSITORY_TOKEN/);

  const gate = workflowStep(
    workflow,
    'Select remediation or product-development mode',
    'Check out the selected exact revision without persisted credentials',
  );
  assert.match(
    gate,
    /env:\n          GH_TOKEN: \$\{\{ github\.token \}\}/,
  );
});

test('the model receives a clean environment and cannot persist Git control-plane state', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  assert.match(workflow, /- name: Capture trusted Git control plane/);

  const modelStep = workflowStep(
    workflow,
    'Run the NVIDIA NIM development agent',
    'Set up Node.js for exact repository verification',
  );
  const cleanEnvironmentStart = modelStep.indexOf('env -i');
  const invocationEnd = modelStep.indexOf('opencode run', cleanEnvironmentStart);
  assert.ok(cleanEnvironmentStart >= 0 && invocationEnd > cleanEnvironmentStart);
  const cleanInvocation = modelStep.slice(cleanEnvironmentStart, invocationEnd);

  assert.match(cleanInvocation, /HOME="\$model_home"/);
  assert.match(cleanInvocation, /TMPDIR="\$model_tmp"/);
  assert.match(cleanInvocation, /XDG_CONFIG_HOME="\$model_home\/\.config"/);
  assert.match(cleanInvocation, /XDG_CACHE_HOME="\$model_home\/\.cache"/);
  assert.match(cleanInvocation, /PATH="\$trusted_path"/);
  assert.match(cleanInvocation, /NVIDIA_API_KEY="\$NVIDIA_API_KEY"/);
  assert.doesNotMatch(
    cleanInvocation,
    /GITHUB_(?:ENV|PATH|OUTPUT|STATE|STEP_SUMMARY|TOKEN)|GH_TOKEN|REPOSITORY_TOKEN|ACTIONS_ID_TOKEN/,
  );

  assert.match(modelStep, /restore_git_control_plane/);
  assert.match(modelStep, /\.git\/config/);
  assert.match(modelStep, /\.git\/HEAD/);
  assert.match(modelStep, /\.git\/refs/);
  assert.match(modelStep, /\.git\/info/);
  assert.match(modelStep, /\.git\/hooks/);
  assert.match(modelStep, /GIT_CONFIG_NOSYSTEM=1/);
  assert.match(modelStep, /GIT_CONFIG_GLOBAL=\/dev\/null/);
  assert.match(modelStep, /GIT_NO_REPLACE_OBJECTS=1/);
  assert.match(modelStep, /core\.hooksPath=\/dev\/null/);
  assert.match(modelStep, /reset --mixed "\$TRUSTED_HEAD_SHA"/);
});

test('commit preparation is token-free and publication cannot execute model-supplied hooks', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  assert.match(
    workflow,
    /- name: Prepare one bounded commit without repository credentials/,
  );

  const prepare = workflowStep(
    workflow,
    'Prepare one bounded commit without repository credentials',
    'Publish one bounded mutation',
  );
  assert.doesNotMatch(prepare, /GH_TOKEN|GITHUB_TOKEN|REPOSITORY_TOKEN|github\.token/);
  assert.match(prepare, /core\.hooksPath=\/dev\/null/);
  assert.match(prepare, /git commit --no-verify/);
  assert.match(prepare, /commit_sha=/);

  const publish = finalWorkflowStep(workflow, 'Publish one bounded mutation');
  assert.match(publish, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(publish, /git add/);
  assert.doesNotMatch(publish, /git commit/);
  assert.match(publish, /core\.hooksPath=\/dev\/null/);
  assert.match(publish, /git push --no-verify/);
  assert.match(publish, /steps\.prepare_commit\.outputs\.commit_sha/);
});
