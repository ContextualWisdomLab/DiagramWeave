import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'packages/language-server-stdio/package.json',
  'packages/language-server-stdio/LICENSE',
  'packages/language-server-stdio/README.md',
  'packages/language-server-stdio/bin/dweave-lsp.js',
  'docs/research/language-server-stdio.md',
  'docs/operations/language-server-stdio.md',
  'docs/product/language-server-stdio.md',
  'docs/superpowers/specs/2026-08-05-language-server-stdio-design.md',
  'docs/superpowers/plans/2026-08-05-language-server-stdio.md',
];

test('repository publishes the bounded stdio transport and durable records', async () => {
  for (const path of requiredFiles) {
    const fileStat = await stat(new URL(`../${path}`, import.meta.url));
    assert.equal(fileStat.isFile(), true, `${path} must be a file`);
  }
});

test('stdio transport documentation records protocol, lifecycle, privacy, and APA references', async () => {
  const [research, operations, product, changelog] = await Promise.all([
    readFile(new URL('../docs/research/language-server-stdio.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operations/language-server-stdio.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/product/language-server-stdio.md', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
  ]);

  assert.match(research, /Language Server Protocol 3\.18/);
  assert.match(research, /RFC 8259/);
  assert.match(research, /APA 7th edition/);
  assert.match(operations, /successful `shutdown` and subsequent\n`exit`/);
  assert.match(operations, /never logged/);
  assert.match(product, /naruon/i);
  assert.match(product, /`dweave-lsp` executable/);
  assert.match(changelog, /bounded JSON-RPC 2\.0 stdio transport/);
});

test('workspace lock owns the independently reusable stdio package', async () => {
  const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(lockfile.packages['node_modules/@contextualwisdomlab/diagramweave-language-server-stdio'], {
    resolved: 'packages/language-server-stdio',
    link: true,
  });
  assert.deepEqual(lockfile.packages['packages/language-server-stdio'], {
    name: '@contextualwisdomlab/diagramweave-language-server-stdio',
    version: '0.0.0',
    license: 'MIT',
    dependencies: {
      '@contextualwisdomlab/diagramweave-language-server': '0.0.0',
    },
    bin: {
      'dweave-lsp': 'bin/dweave-lsp.js',
    },
    engines: {
      node: '>=22 <25',
    },
  });
});
