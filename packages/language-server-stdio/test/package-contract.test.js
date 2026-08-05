import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  LanguageServerStdioError,
  createLanguageServerStdioConnection,
  languageServerStdioLimits,
  runLanguageServerStdioProcess,
} from '../src/index.js';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const binSource = await readFile(new URL('../bin/dweave-lsp.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('publishes an independently reusable bounded stdio transport', () => {
  assert.equal(manifest.name, '@contextualwisdomlab/diagramweave-language-server-stdio');
  assert.equal(manifest.version, '0.0.0');
  assert.equal(manifest.exports, './src/index.js');
  assert.deepEqual(manifest.bin, { 'dweave-lsp': './bin/dweave-lsp.js' });
  assert.deepEqual(manifest.files, ['bin', 'src']);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.engines.node, '>=22 <25');
  assert.deepEqual(manifest.dependencies, {
    '@contextualwisdomlab/diagramweave-language-server': '0.0.0',
  });
  assert.equal(binSource.startsWith('#!/usr/bin/env node\n'), true);
  assert.match(indexSource, /createLanguageServerStdioConnection/);
  assert.match(indexSource, /runLanguageServerStdioProcess/);
  assert.match(indexSource, /LanguageServerStdioError/);
  assert.match(indexSource, /languageServerStdioLimits/);
  assert.equal(typeof createLanguageServerStdioConnection, 'function');
  assert.equal(typeof runLanguageServerStdioProcess, 'function');
  assert.equal(typeof LanguageServerStdioError, 'function');
  assert.equal(Object.isFrozen(languageServerStdioLimits), true);
});

test('documents framing, lifecycle, privacy, and modular-host contracts', () => {
  assert.match(readme, /Content-Length/);
  assert.match(readme, /JSON-RPC version `2\.0`/);
  assert.match(readme, /successful `shutdown` request followed by an\n`exit` notification/);
  assert.match(readme, /never logs source/);
  assert.match(readme, /naruon/i);
  assert.match(readme, /256/);
  assert.match(readme, /test seams/);
});
