import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/src/completions.js',
  'packages/language-server/src/completion-session.js',
  'packages/language-server-stdio/test/completion.test.js',
  'docs/research/plantuml-declaration-completion.md',
  'docs/operations/declaration-completion.md',
  'docs/product/declaration-completion.md',
  'docs/superpowers/specs/2026-08-05-declaration-completion-design.md',
  'docs/superpowers/plans/2026-08-05-declaration-completion.md',
];

test('repository publishes declaration-completion code and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('completion documentation records protocol safety product and modular-host contracts', async () => {
  const [
    rootReadme,
    languageReadme,
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
    readFile(new URL('../docs/research/plantuml-declaration-completion.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/declaration-completion.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/declaration-completion.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/diagramweave-prd.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8'),
    readFile(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8'),
  ]);

  assert.match(rootReadme, /capability-gated\n`textDocument\/completion`/);
  assert.match(rootReadme, /Studio, IDE extensions, naruon, and other CWL hosts reuse this\s+package/);
  assert.match(languageReadme, /completionProvider: \{ resolveProvider: false \}/);
  assert.match(languageReadme, /at most 64 items/);
  assert.match(stdioReadme, /document_position_invalid.*JSON-RPC\n`-32602`/s);
  assert.match(research, /Language Server Protocol specification, version 3\.18/);
  assert.match(research, /JSON-RPC 2\.0 specification/);
  assert.match(research, /PlantUML\. \(n\.d\.\)\. \*State diagram syntax and features\*/);
  assert.match(research, /References — APA 7th edition/);
  assert.match(operations, /URIs are identifiers only and are never dereferenced/);
  assert.match(operations, /No skipped completion test is accepted/);
  assert.match(product, /Studio, IDE extensions, naruon, and other CWL hosts/);
  assert.match(product, /Figma must define at least/);
  assert.match(prd, /capability-negotiated 문서 심볼·개요와 선언 키워드 자동완성 foundation 범위는 구현됐다/);
  assert.match(prd, /completion resolve, semantic member completion/);
  assert.doesNotMatch(prd, /자동완성은 후속 범위다/);
  assert.match(changelog, /textDocument\/completion/);
  assert.match(architecture, /diagnostic session\n  -> document-symbol session\n    -> declaration-completion session/);
  assert.match(architectureIndex, /fixed, deterministic, capability-gated local\n   catalog/);
});

test('public entry point limits and planning records describe the exact completion layer', async () => {
  const [indexSource, limitsSource, design, plan] = await Promise.all([
    readFile(new URL('../packages/language-server/src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../packages/language-server/src/limits.js', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/specs/2026-08-05-declaration-completion-design.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/superpowers/plans/2026-08-05-declaration-completion.md', import.meta.url), 'utf8'),
  ]);

  assert.match(indexSource, /createCompletionLanguageServerSession as createLanguageServerSession/);
  assert.match(limitsSource, /maxCompletionItems: 64/);
  assert.match(design, /completion performs no LLM call, renderer call, file read/);
  assert.match(design, /production line, branch, and function coverage at 100%/);
  assert.doesNotMatch(design, /\b(?:TBD|TODO)\b/);
  assert.match(plan, /Task 6: Package and exact-head verification/);
  assert.match(plan, /npm pack --workspace packages\/language-server-stdio --dry-run --json/);
  assert.doesNotMatch(plan, /\b(?:TBD|TODO)\b/);
});
