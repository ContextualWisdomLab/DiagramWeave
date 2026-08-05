import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'ARCHITECTURE.md',
  'CLAUDE.md',
  'packages/language-server/src/symbols.js',
  'packages/language-server/src/symbol-session.js',
  'docs/research/plantuml-document-symbols.md',
  'docs/operations/document-symbols.md',
  'docs/product/document-symbol-outline.md',
  'docs/superpowers/specs/2026-08-05-document-symbol-outline-design.md',
  'docs/superpowers/plans/2026-08-05-document-symbol-outline.md',
];

test('repository publishes document-symbol code and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('document-symbol documentation records LSP, PlantUML, privacy, and modular-host contracts', async () => {
  const [readme, research, operations, product, changelog, architecture, claude] = await Promise.all([
    readFile(new URL('../packages/language-server/README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/research/plantuml-document-symbols.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/document-symbols.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/document-symbol-outline.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8'),
    readFile(new URL('../CLAUDE.md', import.meta.url), 'utf8'),
  ]);

  assert.match(readme, /textDocument\/documentSymbol/);
  assert.match(readme, /documentSymbolProvider: true/);
  assert.match(readme, /1,024 symbols/);
  assert.match(readme, /UTF-16 code-unit offsets/);
  assert.match(research, /Language Server Protocol specification, version 3\.18/);
  assert.match(research, /PlantUML\. \(n\.d\.\)\. \*Class diagram syntax and features\*/);
  assert.match(research, /APA 7th edition/);
  assert.match(operations, /source URI is an identifier only and is never dereferenced/i);
  assert.match(operations, /rejected newer mutation/i);
  assert.match(product, /Studio, IDE clients,\n`dweave-lsp`, naruon, and other CWL hosts/);
  assert.match(product, /without an LLM/i);
  assert.match(changelog, /textDocument\/documentSymbol/);
  assert.match(architecture, /fail\nby omission/i);
  assert.match(architecture, /NVIDIA_NIM_API_KEY/);
  assert.match(claude, /Read and follow \[`AGENTS\.md`\]/);
  assert.match(claude, /never introduce `COPILOT_GITHUB_TOKEN`/);
});

test('public Language Server entry point composes the symbol session', async () => {
  const [indexSource, limitsSource] = await Promise.all([
    readFile(new URL('../packages/language-server/src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/limits.js', import.meta.url), 'utf8'),
  ]);
  assert.match(indexSource, /createDocumentSymbolLanguageServerSession as createLanguageServerSession/);
  assert.match(limitsSource, /maxDocumentSymbols: 1024/);
  assert.match(limitsSource, /maxSymbolNameBytes: 1024/);
});
