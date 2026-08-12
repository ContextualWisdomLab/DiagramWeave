import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/src/definitions.js',
  'packages/language-server/src/reference-session.js',
  'packages/language-server/test/reference-session.test.js',
  'packages/language-server-stdio/test/references.test.js',
  'docs/research/plantuml-same-document-references.md',
  'docs/operations/same-document-references.md',
  'docs/product/same-document-references.md',
  'docs/superpowers/specs/2026-08-07-conservative-same-document-references-design.md',
  'docs/superpowers/plans/2026-08-07-conservative-same-document-references.md',
];

test('repository publishes same-document reference code tests and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('reference records preserve protocol privacy product and modular-host contracts', async () => {
  const [
    rootReadme,
    packageReadme,
    stdioReadme,
    research,
    operations,
    product,
    changelog,
    architecture,
    prd,
    design,
    plan,
  ] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server-stdio/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/research/plantuml-same-document-references.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/same-document-references.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/same-document-references.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/specs/2026-08-07-conservative-same-document-references-design.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/plans/2026-08-07-conservative-same-document-references.md', import.meta.url), 'utf8'),
  ]);

  for (const text of [rootReadme, packageReadme, stdioReadme, research, operations, product, design, plan]) {
    assert.match(text, /textDocument\/references/);
  }
  for (const text of [packageReadme, stdioReadme, research, operations, design, plan]) {
    assert.match(text, /referencesProvider/);
  }
  for (const text of [packageReadme, research, operations, product, design, plan]) {
    assert.match(text, /includeDeclaration/);
    assert.match(text, /4,096/);
  }
  assert.match(research, /Language Server Protocol 3\.18/);
  assert.match(research, /References — APA 7th edition/);
  assert.match(research, /PlantUML/i);
  assert.match(operations, /URI is an identifier only and is never dereferenced/i);
  assert.match(operations, /No skipped reference test is accepted/i);
  assert.match(product, /Studio.*dweave-lsp.*naruon.*CWL/is);
  assert.match(product, /Figma are mandatory/i);
  assert.match(architecture, /references.*definitions|definitions.*references/is);
  assert.match(prd, /FR-012/);
  assert.match(changelog, /textDocument\/references/);
});

test('implementation exposes exact bounded reference composition and package verification', async () => {
  const [engineSource, sessionSource, indexSource, packageCheck, packageJson] = await Promise.all([
    readFile(new URL('../packages/language-server/src/definitions.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/reference-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-package-contents.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/package.json', import.meta.url), 'utf8'),
  ]);

  assert.match(engineSource, /export function referencesForSource/);
  assert.match(sessionSource, /createDefinitionLanguageServerSession/);
  assert.match(sessionSource, /referencesProvider: true/);
  assert.match(sessionSource, /textDocument\/references/);
  assert.match(indexSource, /createReferenceLanguageServerSession as createLanguageServerSession/);
  assert.match(indexSource, /referencesForSource/);
  assert.match(packageCheck, /package\/src\/reference-session\.js/);
  assert.match(packageJson, /"version": "0\.0\.0"/);
});
