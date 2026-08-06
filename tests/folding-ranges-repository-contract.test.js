import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/src/folding-ranges.js',
  'packages/language-server/src/folding-session.js',
  'packages/language-server/test/folding-ranges.test.js',
  'packages/language-server/test/folding-session.test.js',
  'packages/language-server-stdio/test/folding-range.test.js',
  'docs/research/plantuml-folding-ranges.md',
  'docs/operations/folding-ranges.md',
  'docs/product/folding-ranges.md',
  'docs/superpowers/specs/2026-08-05-conservative-folding-ranges-design.md',
  'docs/superpowers/plans/2026-08-05-conservative-folding-ranges.md',
];

test('repository publishes folding-range code tests and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('folding records preserve LSP PlantUML privacy product and modular-host contracts', async () => {
  const [
    rootReadme,
    packageReadme,
    stdioReadme,
    research,
    operations,
    product,
    prd,
    changelog,
    architecture,
    architectureIndex,
  ] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server-stdio/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/research/plantuml-folding-ranges.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/folding-ranges.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/folding-ranges.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8'),
    readFile(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8'),
  ]);

  for (const text of [rootReadme, packageReadme, stdioReadme, operations, product, prd]) {
    assert.match(text, /textDocument\/foldingRange/);
    assert.match(text, /foldingRangeProvider/);
  }
  assert.match(packageReadme, /rangeLimit/);
  assert.match(packageReadme, /lineFoldingOnly/);
  assert.match(packageReadme, /1,024/);
  assert.match(research, /Language Server Protocol specification, version 3\.18/);
  assert.match(research, /PlantUML\. \(n\.d\.\)\. \*Class diagram syntax and features\*/);
  assert.match(research, /References — APA 7th edition/);
  assert.match(operations, /URI.*identifier.*never dereferenced/is);
  assert.match(operations, /hostile.*capabilit/is);
  assert.match(product, /Studio.*IDE.*dweave-lsp.*naruon.*CWL/is);
  assert.match(product, /does not require a new Figma artifact/is);
  assert.match(prd, /foldingRange.*구현/is);
  assert.match(changelog, /conservative.*textDocument\/foldingRange/is);
  assert.match(architecture, /createFoldingLanguageServerSession/);
  assert.match(architecture, /foldingRangesForSource/);
  assert.match(architecture, /same authoritative.*symbol tree/is);
  assert.match(architectureIndex, /conservative folding ranges/is);
});

test('implementation and package contracts expose the bounded iterative layer', async () => {
  const [
    engineSource,
    sessionSource,
    indexSource,
    packageCheck,
    design,
    plan,
  ] = await Promise.all([
    readFile(new URL('../packages/language-server/src/folding-ranges.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/folding-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-package-contents.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/specs/2026-08-05-conservative-folding-ranges-design.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/plans/2026-08-05-conservative-folding-ranges.md', import.meta.url), 'utf8'),
  ]);

  assert.match(engineSource, /export function foldingRangesForSource/);
  assert.match(engineSource, /documentSymbolsForSource\(source\)/);
  assert.match(engineSource, /while \(stack\.length > 0/);
  assert.match(engineSource, /symbol\.detail === 'package'/);
  assert.match(engineSource, /symbol\.detail === 'namespace'/);
  assert.match(engineSource, /languageServerLimits\.maxDocumentSymbols/);
  assert.match(sessionSource, /foldingOptionsForClient/);
  assert.match(sessionSource, /foldingRangeProvider: true/);
  assert.match(sessionSource, /textDocument\/foldingRange/);
  assert.match(sessionSource, /foldingRangesForSource\(record\.text, foldingOptions\.rangeLimit\)/);
  assert.match(indexSource, /createFoldingLanguageServerSession as createLanguageServerSession/);
  assert.match(packageCheck, /package\/src\/folding-ranges\.js/);
  assert.match(packageCheck, /package\/src\/folding-session\.js/);
  assert.match(design, /without recursive product traversal/);
  assert.match(design, /production line, branch, and function coverage at 100%/);
  assert.match(plan, /Task 6: Exact package and repository verification/);
  assert.match(plan, /expected_head_sha/);
  assert.doesNotMatch(design, /\b(?:TBD|TODO)\b/);
  assert.doesNotMatch(plan, /\b(?:TBD|TODO)\b/);
});
