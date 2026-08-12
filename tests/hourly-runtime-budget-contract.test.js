import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

const orchestrationReserveSeconds = 30 * 60;

test('hourly development budget can execute every sequential model fallback', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  const jobTimeoutMatch = workflow.match(
    /runs-on: ubuntu-latest\n    timeout-minutes: (\d+)/,
  );
  const modelTimeoutMatch = workflow.match(
    /OPENCODE_RUN_TIMEOUT_SECONDS: ["'](\d+)["']/,
  );
  const candidatesMatch = workflow.match(
    /OPENCODE_MODEL_CANDIDATES: >-\n((?:        \S.*\n)+)      OPENCODE_RUN_TIMEOUT_SECONDS:/,
  );

  assert.ok(jobTimeoutMatch, 'hourly development must declare a job timeout');
  assert.ok(modelTimeoutMatch, 'hourly development must bound each model attempt');
  assert.ok(candidatesMatch, 'hourly development must declare its model fallback pool');

  const jobTimeoutSeconds = Number(jobTimeoutMatch[1]) * 60;
  const modelTimeoutSeconds = Number(modelTimeoutMatch[1]);
  const modelCandidates = candidatesMatch[1]
    .trim()
    .split('\n')
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const requiredSeconds =
    modelCandidates.length * modelTimeoutSeconds + orchestrationReserveSeconds;

  assert.ok(modelCandidates.length > 1, 'the fallback pool must remain explicit');
  assert.ok(
    jobTimeoutSeconds >= requiredSeconds,
    `job timeout ${jobTimeoutSeconds}s cannot cover ${modelCandidates.length} sequential ` +
      `model attempts at ${modelTimeoutSeconds}s plus ${orchestrationReserveSeconds}s reserve`,
  );
});
