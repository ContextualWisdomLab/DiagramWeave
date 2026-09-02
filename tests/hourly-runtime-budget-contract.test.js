import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

// Reserve covers PR inventory/evidence gathering, vendoring the
// contextual-orchestrator gateway (git clone plus hash-pinned pip install),
// and post-agent verification/publish. Model-level fallback across providers
// is now the gateway's own auto-discovery concern, not this workflow's, so
// only one bounded model attempt needs to fit inside the job timeout.
const orchestrationReserveSeconds = 30 * 60;

test('hourly development budget can execute one full gateway-routed model attempt', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  const jobTimeoutMatch = workflow.match(
    /runs-on: ubuntu-latest\n    timeout-minutes: (\d+)/,
  );
  const modelTimeoutMatch = workflow.match(
    /OPENCODE_RUN_TIMEOUT_SECONDS: ["'](\d+)["']/,
  );

  assert.ok(jobTimeoutMatch, 'hourly development must declare a job timeout');
  assert.ok(modelTimeoutMatch, 'hourly development must bound the model attempt');
  assert.doesNotMatch(
    workflow,
    /OPENCODE_MODEL_CANDIDATES/,
    'model-level fallback belongs to the contextual-orchestrator gateway now, not a repository-level candidate list',
  );

  const jobTimeoutSeconds = Number(jobTimeoutMatch[1]) * 60;
  const modelTimeoutSeconds = Number(modelTimeoutMatch[1]);
  const requiredSeconds = modelTimeoutSeconds + orchestrationReserveSeconds;

  assert.ok(
    jobTimeoutSeconds >= requiredSeconds,
    `job timeout ${jobTimeoutSeconds}s cannot cover one model attempt at ` +
      `${modelTimeoutSeconds}s plus ${orchestrationReserveSeconds}s reserve`,
  );
});
