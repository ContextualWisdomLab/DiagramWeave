import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readRepositoryFile,
  workflowStep,
} from './helpers/repository-contract.js';

test('hourly product development treats a clean no-op agent exit as an incomplete candidate', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );
  const modelStep = workflowStep(
    workflow,
    'Run the NVIDIA NIM development agent',
    'Set up Node.js for exact repository verification',
  );

  assert.match(
    modelStep,
    /EXECUTION_MODE: \$\{\{ steps\.gate\.outputs\.mode \}\}/,
  );
  assert.match(modelStep, /completed_without_mutation/);
  assert.match(modelStep, /git status --porcelain --untracked-files=all/);
  assert.match(modelStep, /grep -vE '\^\\\?\\\? PR_MESSAGE\\\.md\$'/);
  assert.match(
    modelStep,
    /completed without a repository mutation; trying the next candidate/i,
  );
  assert.match(modelStep, /git reset --hard HEAD/);
  assert.match(modelStep, /git clean -fd/);
  assert.match(modelStep, /EXECUTION_MODE.*remediation/s);
  assert.match(
    modelStep,
    /failed or completed without a product mutation/i,
  );
  assert.match(modelStep, /exit 1/);
});

test('verification independently rejects a no-op product-development result', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );
  const verificationStep = workflowStep(
    workflow,
    'Verify the proposed mutation',
    'Publish one bounded mutation',
  );

  assert.match(
    verificationStep,
    /EXECUTION_MODE: \$\{\{ steps\.gate\.outputs\.mode \}\}/,
  );
  assert.match(
    verificationStep,
    /Product-development mode completed without a repository mutation/i,
  );
  assert.match(
    verificationStep,
    /if \[ "\$EXECUTION_MODE" = "product" \]; then[\s\S]*?exit 1/,
  );
});
