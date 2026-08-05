import assert from 'node:assert/strict';
import test from 'node:test';

import { symbolInformationForDocument } from '../src/symbol-information.js';
import { documentSymbolsForSource } from '../src/symbols.js';

const uri = 'file:///workspace/model.puml';

test('flattens hierarchical document symbols into immutable source-order information', () => {
  const tree = documentSymbolsForSource([
    'package Platform {',
    '  namespace api {',
    '    class Gateway',
    '  }',
    '  class Worker',
    '}',
    'class External',
  ].join('\n'));

  const items = symbolInformationForDocument(uri, tree);
  assert.deepEqual(items.map(({ name }) => name), [
    'Platform',
    'api',
    'Gateway',
    'Worker',
    'External',
  ]);
  assert.equal(items[0].containerName, undefined);
  assert.equal(items[1].containerName, 'Platform');
  assert.equal(items[2].containerName, 'api');
  assert.equal(items[3].containerName, 'Platform');
  assert.equal(items[4].containerName, undefined);
  assert.equal(items[2].location.uri, uri);
  assert.deepEqual(items[2].location.range, tree[0].children[0].children[0].range);

  assert.equal(Object.isFrozen(items), true);
  for (const item of items) {
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.location), true);
    assert.equal(Object.isFrozen(item.location.range), true);
    assert.equal(Object.isFrozen(item.location.range.start), true);
    assert.equal(Object.isFrozen(item.location.range.end), true);
    assert.equal('detail' in item, false);
    assert.equal('selectionRange' in item, false);
    assert.equal('children' in item, false);
  }
});

test('flattens the bounded maximum-depth hierarchy without recursive traversal', () => {
  const depth = 512;
  const lines = [];
  for (let index = 0; index < depth; index += 1) {
    lines.push(`${'  '.repeat(index)}package Scope${index} {`);
  }
  lines.push(`${'  '.repeat(depth)}class Leaf`);
  for (let index = depth - 1; index >= 0; index -= 1) {
    lines.push(`${'  '.repeat(index)}}`);
  }

  const tree = documentSymbolsForSource(lines.join('\n'));
  const items = symbolInformationForDocument(uri, tree);
  assert.equal(items.length, depth + 1);
  assert.equal(items[0].name, 'Scope0');
  assert.equal(items.at(-1).name, 'Leaf');
  assert.equal(items.at(-1).containerName, `Scope${depth - 1}`);
});
