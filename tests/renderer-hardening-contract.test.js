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
  assert.match(packageReadme, /spawnImpl is a test-only process seam\./i);
  assert.match(packageReadme, /production hosts must omit `spawnImpl`/i);
  assert.match(operations, /plantUmlRendererLimits/);
  assert.match(operations, /spawnImpl is a test-only process seam\./i);
  assert.match(operations, /production hosts must omit `spawnImpl`/i);
  assert.match(
    operations,
    /^\|\s*deadline\s*\|\s*15 seconds\s*\|\s*10 ms–120 seconds\s*\|$/im,
  );
  assert.match(
    operations,
    /^\|\s*source\s*\|\s*1 MiB UTF-8\s*\|\s*1 byte–16 MiB\s*\|$/im,
  );
});
