import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server/package.json',
  'packages/language-server/LICENSE',
  'packages/language-server/README.md',
  'docs/research/language-server-foundation.md',
  'docs/operations/language-server.md',
  'docs/product/language-server-foundation.md',
  'docs/superpowers/specs/2026-08-05-language-server-foundation-design.md',
  'docs/superpowers/plans/2026-08-05-language-server-foundation.md',
];

test('repository publishes the Language Server package and durable standards records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('Language Server documentation records protocol, URI, JSON, and modular boundaries', async () => {
  const [research, operations, product, changelog] = await Promise.all([
    readFile(new URL('../docs/research/language-server-foundation.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/language-server.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/language-server-foundation.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
  ]);

  assert.match(research, /Language Server Protocol specification, version 3\.18/);
  assert.match(research, /RFC 3986/);
  assert.match(research, /RFC 8089/);
  assert.match(research, /RFC 8259/);
  assert.match(research, /APA 7th edition/);
  assert.match(operations, /TextDocumentSyncKind\.Full/);
  assert.match(operations, /stale renderer completions/i);
  assert.match(product, /G-06, FR-011, and FR-023/);
  assert.match(product, /naruon/i);
  assert.match(changelog, /transport-neutral LSP 3\.18 PlantUML diagnostic session/);
});

test('workspace lock owns the independently reusable Language Server package', async () => {
  const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(lockfile.packages['node_modules/@contextualwisdomlab/diagramweave-language-server'], {
    resolved: 'packages/language-server',
    link: true,
  });
  assert.deepEqual(lockfile.packages['packages/language-server'].dependencies, {
    '@contextualwisdomlab/diagramweave-plantuml-renderer': '0.0.0',
  });
});
