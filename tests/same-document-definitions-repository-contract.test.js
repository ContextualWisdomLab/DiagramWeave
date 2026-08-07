import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/src/definitions.js',
  'packages/language-server/src/definition-session.js',
  'packages/language-server/test/definition-session.test.js',
  'packages/language-server-stdio/test/definition.test.js',
  'docs/research/plantuml-same-document-definitions.md',
  'docs/operations/same-document-definitions.md',
  'docs/product/same-document-definitions.md',
  'docs/superpowers/specs/2026-08-07-conservative-same-document-definitions-design.md',
  'docs/superpowers/plans/2026-08-07-conservative-same-document-definitions.md',
];

test('repository publishes same-document definition code tests and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('definition records preserve protocol privacy product and modular-host contracts', async () => {
  const [packageReadme, research, operations, product, changelog, design, plan] =
    await Promise.all([
      readFile(new URL('../packages/language-server/README.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/research/plantuml-same-document-definitions.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/operations/same-document-definitions.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/product/same-document-definitions.md', import.meta.url), 'utf8'),
      readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/superpowers/specs/2026-08-07-conservative-same-document-definitions-design.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/superpowers/plans/2026-08-07-conservative-same-document-definitions.md', import.meta.url), 'utf8'),
    ]);

  for (const text of [packageReadme, research, operations, product, design, plan]) {
    assert.match(text, /textDocument\/definition/);
  }
  for (const text of [packageReadme, research, operations, design, plan]) {
    assert.match(text, /definitionProvider/);
  }
  assert.match(packageReadme, /one deeply frozen `Location`/);
  assert.match(research, /Language Server Protocol 3\.18/);
  assert.match(research, /References — APA 7th edition/);
  assert.match(research, /second declaration source of truth/);
  assert.match(operations, /URI is an identifier only and is never dereferenced/i);
  assert.match(operations, /No skipped definition test is accepted/);
  assert.match(product, /Studio.*dweave-lsp.*naruon.*CWL/is);
  assert.match(product, /Figma are mandatory/i);
  assert.match(design, /FR-012/);
  assert.match(plan, /FR-012/);
  assert.match(changelog, /textDocument\/definition/);
});

test('implementation exposes exact bounded definition composition and verification', async () => {
  const [
    engineSource,
    sessionSource,
    indexSource,
    packageCheck,
    design,
    plan,
  ] = await Promise.all([
    readFile(new URL('../packages/language-server/src/definitions.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/definition-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-package-contents.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/specs/2026-08-07-conservative-same-document-definitions-design.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/plans/2026-08-07-conservative-same-document-definitions.md', import.meta.url), 'utf8'),
  ]);

  assert.match(engineSource, /export function definitionForSource/);
  assert.match(engineSource, /documentSymbolsForSource\(source\)/);
  assert.match(engineSource, /while \(stack\.length > 0/);
  assert.match(engineSource, /never creates a second declaration source of truth|does not revalidate or create\n \* a second declaration source of truth/);
  assert.match(sessionSource, /createHoverLanguageServerSession/);
  assert.match(sessionSource, /definitionProvider: true/);
  assert.match(sessionSource, /textDocument\/definition/);
  assert.match(indexSource, /createDefinitionLanguageServerSession as createLanguageServerSession/);
  assert.match(packageCheck, /package\/src\/definitions\.js/);
  assert.match(packageCheck, /package\/src\/definition-session\.js/);
  assert.match(design, /production line, branch, function, and JSDoc coverage at exactly 100%/i);
  assert.match(plan, /Task 8: Run exact-head verification and prepare the pull request/);
  assert.match(plan, /npm pack --workspace packages\/language-server-stdio --dry-run --json/);
  assert.doesNotMatch(design, /\b(?:TBD|TODO)\b/);
  assert.doesNotMatch(plan, /\b(?:TBD|TODO)\b/);
});
