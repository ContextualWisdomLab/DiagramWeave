import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('publishes an independently reusable transport-neutral package', () => {
  assert.equal(manifest.name, '@contextualwisdomlab/diagramweave-language-server');
  assert.equal(manifest.version, '0.0.0');
  assert.equal(manifest.exports, './src/index.js');
  assert.deepEqual(manifest.files, ['src']);
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.engines.node, '>=22 <25');
  assert.deepEqual(manifest.dependencies, {
    '@contextualwisdomlab/diagramweave-plantuml-renderer': '0.0.0',
  });
  assert.match(manifest.description, /declaration hover/i);
  assert.match(
    indexSource,
    /createHoverLanguageServerSession as createLanguageServerSession/,
  );
  assert.match(indexSource, /LanguageServerError/);
  assert.match(indexSource, /languageServerLimits/);
  assert.doesNotMatch(
    indexSource,
    /normalizeDocumentUri|diagnosticsForRendererOutcome|declarationHoverForSource/,
  );
  assert.match(readme, /Language Server Protocol 3\.18/);
  assert.match(readme, /textDocument\/hover/);
  assert.match(readme, /hoverProvider/);
  assert.match(readme, /naruon/i);
  assert.match(readme, /never dereferences/i);
  assert.match(readme, /256 open documents/);
});
