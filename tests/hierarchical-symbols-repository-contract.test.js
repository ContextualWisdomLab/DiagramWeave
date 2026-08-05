import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/test/hierarchical-symbols.test.js',
  'docs/research/plantuml-hierarchical-document-symbols.md',
  'docs/operations/hierarchical-document-symbols.md',
  'docs/product/hierarchical-document-outline.md',
  'docs/superpowers/specs/2026-08-05-hierarchical-document-symbols-design.md',
  'docs/superpowers/plans/2026-08-05-hierarchical-document-symbols.md',
];

test('repository publishes hierarchical-symbol code tests and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('hierarchical outline records preserve LSP PlantUML safety and modular-host contracts', async () => {
  const [
    rootReadme,
    packageReadme,
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
    readFile(new URL('../docs/research/plantuml-hierarchical-document-symbols.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/hierarchical-document-symbols.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/hierarchical-document-outline.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8'),
    readFile(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8'),
  ]);

  assert.match(rootReadme, /capability-negotiated `textDocument\/documentSymbol`/);
  assert.match(rootReadme, /Hierarchical-outline product slice/);
  assert.match(packageReadme, /optional frozen `children`/);
  assert.match(packageReadme, /built and frozen bottom-up without recursive product traversal/);
  assert.match(research, /Language Server Protocol specification, version 3\.18/);
  assert.match(research, /PlantUML\. \(n\.d\.\)\. \*Class diagram syntax and features\*/);
  assert.match(research, /References — APA 7th edition/);
  assert.match(operations, /Indentation by itself never creates ownership/);
  assert.match(operations, /URIs are identifiers only and are never dereferenced/);
  assert.match(product, /Studio, IDE extensions, naruon, and other CWL/);
  assert.match(product, /Product Design and Figma must define/);
  assert.match(prd, /capability-negotiated 문서 심볼·개요와 선언 키워드 자동완성 foundation 범위는 구현됐다/);
  assert.match(prd, /legacy `SymbolInformation\[\]` compatibility 구현은 완료됐/);
  assert.match(changelog, /Conservative hierarchical LSP 3\.18 document symbols/);
  assert.match(architecture, /Hierarchy requires complete structural evidence/);
  assert.match(architecture, /freezes children bottom-up into one authoritative bounded tree/);
  assert.match(architectureIndex, /Outline hierarchy is created only from one unmatched unquoted declaration/);
});

test('hierarchical scanner and plans expose exact bounded nonrecursive contracts', async () => {
  const [source, design, plan] = await Promise.all([
    readFile(new URL('../packages/language-server/src/symbols.js', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/specs/2026-08-05-hierarchical-document-symbols-design.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/plans/2026-08-05-hierarchical-document-symbols.md', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /const standaloneClosingBracePattern/);
  assert.match(source, /function structuralBraces/);
  assert.match(source, /function assignParents/);
  assert.match(source, /function freezeSymbolTree/);
  assert.match(source, /symbol\.children = children/);
  assert.match(source, /records\.length >= languageServerLimits\.maxDocumentSymbols/);
  assert.match(design, /same indentation/);
  assert.match(design, /without recursive traversal/);
  assert.match(design, /production line, branch, and function coverage at 100%/);
  assert.match(plan, /Task 6: Exact package and repository verification/);
  assert.match(plan, /Squash merge using `expected_head_sha`/);
  assert.doesNotMatch(design, /\b(?:TBD|TODO)\b/);
  assert.doesNotMatch(plan, /\b(?:TBD|TODO)\b/);
});
