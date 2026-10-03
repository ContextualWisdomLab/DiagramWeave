import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

test('disabled consumer declares no caller-owned model timeout or fallback pool', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.doesNotMatch(workflow, /timeout-minutes/);
  assert.doesNotMatch(workflow, /timeout --kill-after/);
  assert.doesNotMatch(workflow, /OPENCODE_RUN_TIMEOUT_SECONDS/);
  assert.doesNotMatch(workflow, /OPENCODE_MODEL_CANDIDATES/);
  assert.doesNotMatch(workflow, /small_model|enabled_providers|provider:/);
});
