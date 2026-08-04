import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'AGENTS.md',
  'SECURITY.md',
  'package.json',
  'package-lock.json',
  '.github/workflows/ci.yml',
  '.gitignore',
  'docs/product/diagramweave-prd.md',
  'docs/architecture.md',
  'docs/security-model.md',
  'docs/operations/contextual-orchestrator.md',
  'docs/operations/hourly-development.md',
  '.github/workflows/hourly-pr-maintenance.yml',
  '.github/workflows/hourly-product-development.yml',
];

test('repository publishes the required product and governance files', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('root package exposes exact quality gates', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.equal(packageJson.name, '@contextualwisdomlab/diagramweave');
  assert.equal(packageJson.private, true);
  assert.deepEqual(packageJson.workspaces, ['packages/*']);
  assert.deepEqual(Object.keys(packageJson.scripts).sort(), [
    'coverage',
    'docstrings',
    'syntax',
    'test',
    'verify',
  ]);
  assert.equal(packageJson.engines.node, '>=22 <25');
});

test('changelog starts at Unreleased and names the foundation', async () => {
  const changelog = await readFile(
    new URL('../CHANGELOG.md', import.meta.url),
    'utf8',
  );

  assert.match(changelog, /^# Changelog/m);
  assert.match(changelog, /^## \[Unreleased\]/m);
  assert.match(changelog, /revision-safe edit proposals/i);
  assert.match(changelog, /Contextual Orchestrator/i);
});


test('product documentation preserves the source-first modular contract', async () => {
  const [readme, architecture, securityModel, operations, prd] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/security-model.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/contextual-orchestrator.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
  ]);

  assert.match(readme, /manual editing.*without.*LLM/is);
  assert.match(readme, /@contextualwisdomlab\/diagramweave-core/);
  assert.match(readme, /@contextualwisdomlab\/diagramweave-contextual-orchestrator/);
  assert.match(architecture, /DiagramWeave Core/);
  assert.match(architecture, /DiagramWeave Studio/);
  assert.match(architecture, /naruon/i);
  assert.match(architecture, /modular MSA/i);
  assert.match(securityModel, /PlantUML.*SANDBOX/is);
  assert.match(securityModel, /remote include.*disabled/is);
  assert.match(securityModel, /untrusted data/i);
  assert.match(operations, /\/v1\/chat\/completions/);
  assert.match(operations, /HTTPS.*loopback HTTP/is);
  assert.match(operations, /provider_timeout/);
  assert.match(prd, /^# DiagramWeave 제품 요구사항 문서\(PRD\)/m);
});

test('gitignore excludes generated dependency and coverage state', async () => {
  const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gitignore, /^node_modules\/$/m);
  assert.match(gitignore, /^coverage\/$/m);
  assert.match(gitignore, /^\.coverage\/$/m);
});
