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
  'packages/plantuml-renderer/README.md',
  'packages/plantuml-renderer/LICENSE',
  '.github/workflows/ci.yml',
  '.gitignore',
  'docs/product/diagramweave-prd.md',
  'docs/architecture.md',
  'docs/security-model.md',
  'docs/operations/contextual-orchestrator.md',
  'docs/operations/hourly-development.md',
  'docs/operations/plantuml-renderer.md',
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
  assert.match(changelog, /sandboxed.*PlantUML renderer/is);
});


test('product documentation preserves the source-first modular contract', async () => {
  const [readme, architecture, securityModel, operations, rendererOperations, prd] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/security-model.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/contextual-orchestrator.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/plantuml-renderer.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
  ]);

  assert.match(readme, /manual editing.*without.*LLM/is);
  assert.match(readme, /@contextualwisdomlab\/diagramweave-core/);
  assert.match(readme, /@contextualwisdomlab\/diagramweave-contextual-orchestrator/);
  assert.match(readme, /@contextualwisdomlab\/diagramweave-plantuml-renderer/);
  assert.match(architecture, /DiagramWeave Core/);
  assert.match(architecture, /DiagramWeave Studio/);
  assert.match(architecture, /naruon/i);
  assert.match(architecture, /modular MSA/i);
  assert.match(securityModel, /PlantUML.*SANDBOX/is);
  assert.match(securityModel, /no remote or local include mode/is);
  assert.match(securityModel, /untrusted data/i);
  assert.match(securityModel, /Rendered SVG remains untrusted active content/i);
  assert.match(securityModel, /must not inject it through `innerHTML`/i);
  assert.match(operations, /\/v1\/chat\/completions/);
  assert.match(operations, /HTTPS.*loopback HTTP/is);
  assert.match(operations, /provider_timeout/);
  assert.match(rendererOperations, /PLANTUML_SECURITY_PROFILE=SANDBOX/);
  assert.match(rendererOperations, /-nometadata/);
  assert.match(rendererOperations, /host-supplied|operator supplies/is);
  assert.match(rendererOperations, /renderer_output_too_large/);
  assert.match(rendererOperations, /SVG is active, untrusted content/i);
  assert.match(rendererOperations, /must not inject.*`innerHTML`/i);
  assert.match(prd, /^# DiagramWeave 제품 요구사항 문서\(PRD\)/m);
});


test('workspace publishes independently reusable package manifests', async () => {
  const packagePaths = [
    '../packages/core/package.json',
    '../packages/contextual-orchestrator/package.json',
    '../packages/plantuml-renderer/package.json',
  ];
  const names = [];
  for (const path of packagePaths) {
    const manifest = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
    names.push(manifest.name);
    assert.equal(manifest.version, '0.0.0');
    assert.equal(manifest.engines.node, '>=22 <25');
    if (manifest.name === '@contextualwisdomlab/diagramweave-plantuml-renderer') {
      assert.deepEqual(manifest.files, ['src']);
      assert.equal(manifest.sideEffects, false);
    }
  }
  assert.deepEqual(names, [
    '@contextualwisdomlab/diagramweave-core',
    '@contextualwisdomlab/diagramweave-contextual-orchestrator',
    '@contextualwisdomlab/diagramweave-plantuml-renderer',
  ]);
});

test('gitignore excludes generated dependency and coverage state', async () => {
  const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gitignore, /^node_modules\/$/m);
  assert.match(gitignore, /^coverage\/$/m);
  assert.match(gitignore, /^\.coverage\/$/m);
});
