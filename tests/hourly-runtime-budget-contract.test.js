import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

test('hourly development leaves model duration to the three-hour job budget', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  const jobTimeoutMatch = workflow.match(
    /runs-on: ubuntu-latest\n    timeout-minutes: (\d+)/,
  );
  assert.ok(jobTimeoutMatch, 'hourly development must declare a job timeout');
  assert.ok(Number(jobTimeoutMatch[1]) >= 180);
  assert.doesNotMatch(workflow, /OPENCODE_RUN_TIMEOUT_SECONDS/);
  assert.doesNotMatch(workflow, /timeout --kill-after=30s/);
  assert.doesNotMatch(
    workflow,
    /OPENCODE_MODEL_CANDIDATES/,
    'model-level fallback belongs to the contextual-orchestrator gateway now, not a repository-level candidate list',
  );
});
