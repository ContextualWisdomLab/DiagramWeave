import assert from 'node:assert/strict';
import test from 'node:test';

import { readRepositoryFile } from './helpers/repository-contract.js';

test('disabled product-development workflow cannot mutate repository state', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/hourly-product-development.yml',
  );

  assert.match(workflow, /consumer integration remains disabled/i);
  assert.match(workflow, /ContextualWisdomLab\/DiagramWeave#35/);
  assert.match(workflow, /ContextualWisdomLab\/DiagramWeave#28/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.doesNotMatch(workflow, /setup-node|setup-python/);
  assert.doesNotMatch(workflow, /opencode run/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /id-token: write|actions: write|checks: write/);
});
