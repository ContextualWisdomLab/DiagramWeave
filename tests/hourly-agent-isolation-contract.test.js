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

test('the model runs as a separate user in a disposable local clone', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  assert.match(workflow, /- name: Capture trusted Git control plane/);

  const modelStep = workflowStep(
    workflow,
    'Run the NVIDIA NIM development agent',
    'Verify the proposed mutation in an isolated clone',
  );

  assert.match(modelStep, /agent_user="diagramweave-agent"/);
  assert.match(modelStep, /sudo useradd/);
  assert.match(modelStep, /chmod 0700 "\$GITHUB_WORKSPACE"/);
  assert.match(modelStep, /git clone --no-hardlinks/);
  assert.match(modelStep, /remote remove origin/);
  assert.match(modelStep, /sudo chown -R "\$agent_user"/);
  assert.match(modelStep, /sudo -u "\$agent_user"/);
  assert.match(modelStep, /pkill -KILL -u "\$agent_user"/);
  assert.match(modelStep, /pgrep -u "\$agent_user"/);

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
});

test('the trusted shell restores Git metadata and exports a bounded secret-free proposal', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const modelStep = workflowStep(
    workflow,
    'Run the NVIDIA NIM development agent',
    'Verify the proposed mutation in an isolated clone',
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
  assert.match(modelStep, /diff --binary --full-index --no-ext-diff --no-textconv/);
  assert.match(modelStep, /ls-files --others --exclude-standard -z/);
  assert.match(modelStep, /maximum_tracked_path_count/);
  assert.match(modelStep, /maximum_patch_bytes/);
  assert.match(modelStep, /maximum_file_count/);
  assert.match(modelStep, /maximum_total_bytes/);
  assert.match(modelStep, /is_symlink\(\)/);
  assert.match(modelStep, /is_file\(\)/);
  assert.match(modelStep, /0o755 if .* else 0o644/s);
  assert.match(modelStep, /NVIDIA_API_KEY/);
  assert.match(modelStep, /secret.*proposal|proposal.*secret/i);
  assert.match(modelStep, /proposal_manifest_sha256/);
  assert.match(modelStep, /PR_MESSAGE\.md/);
});

test('verification runs as a separate user in a disposable clone without repository authority', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const verification = workflowStep(
    workflow,
    'Verify the proposed mutation in an isolated clone',
    'Import the verified bounded proposal',
  );

  assert.match(verification, /verifier_user="diagramweave-verifier"/);
  assert.match(verification, /git clone --no-hardlinks/);
  assert.match(verification, /remote remove origin/);
  assert.match(verification, /sudo chown -R "\$verifier_user"/);
  assert.match(verification, /sudo -u "\$verifier_user"/);
  assert.match(verification, /env -i/);
  assert.match(verification, /HOME="\$verifier_home"/);
  assert.match(verification, /TMPDIR="\$verifier_tmp"/);
  assert.doesNotMatch(
    verification,
    /GITHUB_(?:ENV|PATH|OUTPUT|STATE|STEP_SUMMARY|TOKEN)|GH_TOKEN|REPOSITORY_TOKEN|ACTIONS_ID_TOKEN/,
  );
  assert.match(verification, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(verification, /npm run verify/);
  assert.match(verification, /node scripts\/check-package-contents\.mjs/);
  assert.match(verification, /pkill -KILL -u "\$verifier_user"/);
  assert.match(verification, /pgrep -u "\$verifier_user"/);
  assert.match(verification, /proposal_manifest_sha256/);
  assert.match(verification, /verification_manifest_sha256/);
  assert.match(verification, /verified_tree_hash/);
});

test('trusted import occurs only after isolated verification and preserves the verified tree', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const importStep = workflowStep(
    workflow,
    'Import the verified bounded proposal',
    'Prepare one bounded commit without repository credentials',
  );

  assert.doesNotMatch(
    importStep,
    /GH_TOKEN|GITHUB_TOKEN|REPOSITORY_TOKEN|github\.token/,
  );
  assert.match(importStep, /git apply --binary/);
  assert.match(importStep, /proposal_manifest_sha256/);
  assert.match(importStep, /verified_tree_hash/);
  assert.match(importStep, /imported_tree_hash/);
  assert.match(importStep, /Product-development mode completed without a repository mutation/i);
});

test('commit preparation is token-free and publication cannot execute proposal-supplied hooks', async () => {
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
  assert.match(publish, /diagramweave-agent/);
  assert.match(publish, /diagramweave-verifier/);
});

test('governance records cover model and verifier persistence threats', async () => {
  const securityModel = await readRepositoryFile('docs/security-model.md');
  const operations = await readRepositoryFile('docs/operations/hourly-development.md');
  const adr = await readRepositoryFile('docs/adr/0007-automation-authority.md');

  for (const document of [securityModel, operations, adr]) {
    assert.match(document, /separate operating-system user/i);
    assert.match(document, /disposable local clone/i);
    assert.match(document, /isolated verification/i);
    assert.match(document, /Git control plane/i);
    assert.match(document, /token-free commit/i);
    assert.match(document, /hooks disabled/i);
  }
  assert.match(securityModel, /GitHub command files/i);
  assert.match(securityModel, /detached background process/i);
  assert.match(securityModel, /secret exfiltration/i);
  assert.match(securityModel, /source mutation during verification/i);
});
