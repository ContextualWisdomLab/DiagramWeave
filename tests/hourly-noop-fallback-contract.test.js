import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  readRepositoryFile,
  workflowStep,
} from './helpers/repository-contract.js';

const workflowPath = '.github/workflows/hourly-product-development.yml';

function shellScript(workflow, stepName, nextStepName) {
  const step = workflowStep(workflow, stepName, nextStepName);
  const runMarker = '        run: |\n';
  const runStart = step.indexOf(runMarker);
  assert.notEqual(runStart, -1, `${stepName} must contain a shell run block`);
  return step
    .slice(runStart + runMarker.length)
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

function shellIfBlock(script, openingLine) {
  const lines = script.split('\n');
  const start = lines.findIndex((line) => line.trim() === openingLine);
  assert.notEqual(start, -1, `${openingLine} block must exist`);

  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('if ')) {
      depth += 1;
    }
    if (trimmed === 'fi') {
      depth -= 1;
      if (depth === 0) {
        return lines.slice(start, index + 1).join('\n');
      }
    }
  }
  assert.fail(`${openingLine} block must have a matching fi`);
}

function assertOrdered(text, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const index = text.indexOf(needle, cursor + 1);
    assert.ok(index > cursor, `${needle} must occur in the required order`);
    cursor = index;
  }
}

function runProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
}

function runRequired(command, args, options = {}) {
  const result = runProcess(command, args, options);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

async function createModelHarness(modelScript) {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-noop-contract-'));
  const workspace = join(root, 'repository');
  const runnerTemp = join(root, 'runner');
  const executableDirectory = join(root, 'bin');
  const promptPath = join(runnerTemp, 'diagramweave-agent-prompt.md');
  const summaryPath = join(runnerTemp, 'summary.md');
  const modelLogPath = join(runnerTemp, 'models.log');

  await mkdir(workspace);
  await mkdir(runnerTemp);
  await mkdir(executableDirectory);
  await writeFile(join(workspace, 'product.txt'), 'baseline\n', 'utf8');
  await writeFile(promptPath, 'bounded test prompt\n', 'utf8');
  await writeFile(summaryPath, '', 'utf8');
  await writeFile(modelLogPath, '', 'utf8');
  await writeFile(
    join(executableDirectory, 'opencode'),
    `#!/usr/bin/env bash
set -euo pipefail
model="\${!#}"
printf '%s\\n' "$model" >>"$MODEL_LOG"
case "$model" in
  fail*)
    printf 'partial\\n' >"$GITHUB_WORKSPACE/junk-$model.txt"
    exit 1
    ;;
  metadata)
    printf 'metadata-only\\n' >"$GITHUB_WORKSPACE/PR_MESSAGE.md"
    exit 0
    ;;
  mutate)
    printf 'verified mutation\\n' >>"$GITHUB_WORKSPACE/product.txt"
    exit 0
    ;;
  noop)
    exit 0
    ;;
  *)
    echo "unexpected model $model" >&2
    exit 64
    ;;
esac
`,
    'utf8',
  );
  await chmod(join(executableDirectory, 'opencode'), 0o755);

  runRequired('git', ['init', '--quiet'], { cwd: workspace });
  runRequired('git', ['config', 'user.name', 'Contract Test'], {
    cwd: workspace,
  });
  runRequired('git', ['config', 'user.email', 'contract@example.invalid'], {
    cwd: workspace,
  });
  runRequired('git', ['add', 'product.txt'], { cwd: workspace });
  runRequired('git', ['commit', '--quiet', '-m', 'baseline'], {
    cwd: workspace,
  });

  return {
    modelLogPath,
    root,
    summaryPath,
    workspace,
    async resetEvidence() {
      await writeFile(summaryPath, '', 'utf8');
      await writeFile(modelLogPath, '', 'utf8');
    },
    run(executionMode, models) {
      return runProcess('bash', ['-c', modelScript], {
        cwd: workspace,
        env: {
          ...process.env,
          EXECUTION_MODE: executionMode,
          GITHUB_STEP_SUMMARY: summaryPath,
          GITHUB_WORKSPACE: workspace,
          MODEL_LOG: modelLogPath,
          OPENCODE_MODEL_CANDIDATES: models.join(' '),
          OPENCODE_RUN_TIMEOUT_SECONDS: '10',
          PATH: `${executableDirectory}:${process.env.PATH}`,
          RUNNER_TEMP: runnerTemp,
        },
      });
    },
  };
}

test('candidate control flow filters status, cleans failed output, and retries in order', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const modelScript = shellScript(
    workflow,
    'Run the NVIDIA NIM development agent',
    'Set up Node.js for exact repository verification',
  );

  assert.match(modelScript, /EXECUTION_MODE.*remediation/s);
  assertOrdered(modelScript, [
    'completed_without_mutation=0',
    'for model in $OPENCODE_MODEL_CANDIDATES; do',
    'if timeout --kill-after=30s',
    'meaningful_status="$(',
    'git status --porcelain --untracked-files=all',
    "grep -vE '^\\?\\? PR_MESSAGE\\.md$' || true",
    'if [ -n "$meaningful_status" ]; then',
    'status=0',
    'break',
    'completed_without_mutation=$((completed_without_mutation + 1))',
    'git reset --hard HEAD',
    'git clean -fd',
    'done',
  ]);

  const harness = await createModelHarness(modelScript);
  try {
    const initialHead = runRequired('git', ['rev-parse', 'HEAD'], {
      cwd: harness.workspace,
    });
    const result = harness.run('product', ['fail_first', 'metadata', 'mutate']);
    assert.equal(
      result.status,
      0,
      `model script failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    assert.deepEqual(
      (await readFile(harness.modelLogPath, 'utf8')).trim().split('\n'),
      ['fail_first', 'metadata', 'mutate'],
    );
    assert.equal(
      runRequired('git', ['rev-parse', 'HEAD'], { cwd: harness.workspace }),
      initialHead,
    );
    assert.equal(
      runRequired('git', ['status', '--porcelain'], { cwd: harness.workspace }),
      'M product.txt',
    );
    await assert.rejects(readFile(join(harness.workspace, 'junk-fail_first.txt')));
    await assert.rejects(readFile(join(harness.workspace, 'PR_MESSAGE.md')));
    assert.match(
      await readFile(join(harness.workspace, 'product.txt'), 'utf8'),
      /verified mutation/,
    );
  } finally {
    await rm(harness.root, { force: true, recursive: true });
  }
});

test('verification rejects a no-op product result inside the product branch', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const verificationScript = shellScript(
    workflow,
    'Verify the proposed mutation',
    'Publish one bounded mutation',
  );
  const noMutationBlock = shellIfBlock(
    verificationScript,
    'if [ -z "$meaningful_status" ]; then',
  );
  const productBlock = shellIfBlock(
    noMutationBlock,
    'if [ "$EXECUTION_MODE" = "product" ]; then',
  );

  assertOrdered(noMutationBlock, [
    'echo "mutation=false" >>"$GITHUB_OUTPUT"',
    'if [ "$EXECUTION_MODE" = "product" ]; then',
    'Product-development mode completed without a repository mutation',
    'exit 1',
    'No safe remediation mutation was produced after candidate exhaustion',
    'exit 0',
  ]);
  assertOrdered(productBlock, [
    'Product-development mode completed without a repository mutation',
    'exit 1',
  ]);
  assert.doesNotMatch(productBlock, /exit 0/);
});

test('candidate exhaustion preserves HEAD, leaves remediation clean, and fails product mode', async () => {
  const workflow = await readRepositoryFile(workflowPath);
  const modelScript = shellScript(
    workflow,
    'Run the NVIDIA NIM development agent',
    'Set up Node.js for exact repository verification',
  );
  const exhaustionBlock = shellIfBlock(
    modelScript,
    'if [ "$status" -ne 0 ]; then',
  );
  const remediationBlock = shellIfBlock(
    exhaustionBlock,
    'if [ "$EXECUTION_MODE" = "remediation" ]; then',
  );

  assert.doesNotMatch(
    exhaustionBlock,
    /git (?:add|commit|push)|gh pr create/,
  );
  assert.doesNotMatch(remediationBlock, /completed_without_mutation/);
  assertOrdered(remediationBlock, [
    'if [ "$EXECUTION_MODE" = "remediation" ]; then',
    'leaving the exact head unchanged after candidate exhaustion',
    'exit 0',
  ]);
  assertOrdered(exhaustionBlock, [
    remediationBlock,
    'Every NVIDIA NIM model candidate failed or completed without a product mutation',
    'exit 1',
  ]);

  const harness = await createModelHarness(modelScript);
  try {
    const initialHead = runRequired('git', ['rev-parse', 'HEAD'], {
      cwd: harness.workspace,
    });
    const remediation = harness.run('remediation', ['fail_a', 'fail_b']);
    assert.equal(
      remediation.status,
      0,
      `remediation failed\nstdout:\n${remediation.stdout}\nstderr:\n${remediation.stderr}`,
    );
    assert.equal(
      runRequired('git', ['rev-parse', 'HEAD'], { cwd: harness.workspace }),
      initialHead,
    );
    assert.equal(
      runRequired('git', ['status', '--porcelain'], { cwd: harness.workspace }),
      '',
    );
    assert.match(
      await readFile(harness.summaryPath, 'utf8'),
      /leaving the exact head unchanged/i,
    );

    await harness.resetEvidence();
    const product = harness.run('product', ['fail_a', 'fail_b']);
    assert.equal(product.status, 1);
    assert.equal(
      runRequired('git', ['rev-parse', 'HEAD'], { cwd: harness.workspace }),
      initialHead,
    );
    assert.equal(
      runRequired('git', ['status', '--porcelain'], { cwd: harness.workspace }),
      '',
    );
    assert.match(
      `${product.stdout}\n${product.stderr}`,
      /without a product mutation/i,
    );
  } finally {
    await rm(harness.root, { force: true, recursive: true });
  }
});
