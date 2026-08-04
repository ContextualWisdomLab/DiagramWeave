import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readRepositoryFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('renderer documentation exposes limits and keeps the process seam test-only', async () => {
  const rootReadme = await readRepositoryFile('README.md');
  const packageReadme = await readRepositoryFile('packages/plantuml-renderer/README.md');
  const operations = await readRepositoryFile('docs/operations/plantuml-renderer.md');

  assert.match(rootReadme, /plantUmlRendererLimits/);
  assert.match(packageReadme, /plantUmlRendererLimits/);
  assert.match(packageReadme, /spawnImpl.*test-only|test-only.*spawnImpl/is);
  assert.match(packageReadme, /production hosts.*omit.*spawnImpl/is);
  assert.match(operations, /plantUmlRendererLimits/);
  assert.match(operations, /spawnImpl.*test-only|test-only.*spawnImpl/is);
});
