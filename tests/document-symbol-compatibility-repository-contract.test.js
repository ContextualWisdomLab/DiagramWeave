import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/src/symbol-information.js',
  'packages/language-server/test/symbol-information.test.js',
  'packages/language-server/test/symbol-compatibility-session.test.js',
  'docs/research/lsp-document-symbol-compatibility.md',
  'docs/operations/document-symbol-compatibility.md',
  'docs/product/document-symbol-compatibility.md',
  'docs/superpowers/specs/2026-08-05-legacy-document-symbol-fallback-design.md',
  'docs/superpowers/plans/2026-08-05-legacy-document-symbol-fallback.md',
];

test('repository publishes document-symbol compatibility code and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('compatibility records preserve protocol privacy product and modular-host contracts', async () => {
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
    readFile(new URL('../docs/research/lsp-document-symbol-compatibility.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/document-symbol-compatibility.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/document-symbol-compatibility.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8'),
    readFile(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8'),
  ]);

  for (const text of [rootReadme, packageReadme, operations, product, prd]) {
    assert.match(text, /hierarchicalDocumentSymbolSupport/);
    assert.match(text, /SymbolInformation\[\]/);
  }
  assert.match(packageReadme, /1,024 symbols/);
  assert.match(packageReadme, /containerName.*immediate/is);
  assert.match(research, /Language Server Protocol specification, version 3\.18/);
  assert.match(research, /References — APA 7th edition/);
  assert.match(operations, /URI.*identifier.*never dereferenced/is);
  assert.match(operations, /hostile.*capabilit/is);
  assert.match(product, /Studio, IDE.*naruon.*CWL/is);
  assert.match(product, /does not require.*Figma/is);
  assert.match(prd, /legacy.*SymbolInformation\[\].*구현/is);
  assert.match(changelog, /capability-negotiated.*SymbolInformation\[\]/is);
  assert.match(architecture, /symbolInformationForDocument/);
  assert.match(architecture, /same authoritative.*tree/is);
  assert.match(architectureIndex, /non-hierarchical.*SymbolInformation\[\]/is);
});

test('implementation and package contracts expose the exact bounded adapter', async () => {
  const [adapterSource, sessionSource, packageCheck, design, plan] = await Promise.all([
    readFile(new URL('../packages/language-server/src/symbol-information.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/symbol-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/check-package-contents.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/specs/2026-08-05-legacy-document-symbol-fallback-design.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/plans/2026-08-05-legacy-document-symbol-fallback.md', import.meta.url), 'utf8'),
  ]);

  assert.match(adapterSource, /export function symbolInformationForDocument/);
  assert.match(adapterSource, /while \(stack\.length > 0\)/);
  assert.match(adapterSource, /containerName/);
  assert.match(sessionSource, /clientSupportsHierarchicalDocumentSymbols/);
  assert.match(sessionSource, /hierarchicalDocumentSymbolSupport === true/);
  assert.match(sessionSource, /symbolInformationForDocument\(normalized\.textDocument\.uri, symbols\)/);
  assert.match(packageCheck, /package\/src\/symbol-information\.js/);
  assert.match(design, /without recursive traversal/);
  assert.match(design, /production line, branch, and function coverage at 100%/);
  assert.match(plan, /Task 5: Exact package and repository verification/);
  assert.match(plan, /expected_head_sha/);
  assert.doesNotMatch(design, /\b(?:TBD|TODO)\b/);
  assert.doesNotMatch(plan, /\b(?:TBD|TODO)\b/);
});
