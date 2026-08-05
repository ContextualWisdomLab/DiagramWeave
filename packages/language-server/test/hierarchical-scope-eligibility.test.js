import assert from 'node:assert/strict';
import test from 'node:test';

import { documentSymbolsForSource } from '../src/symbols.js';

test('creates hierarchy only for package and namespace declaration scopes', () => {
  const source = [
    'class Outer {',
    '  class NotAClassChild',
    '}',
    'component Container {',
    '  class NotAComponentChild',
    '}',
    'package PackageRoot {',
    '  class PackageChild',
    '}',
    'namespace NamespaceRoot {',
    '  class NamespaceChild',
    '}',
  ].join('\n');

  const roots = documentSymbolsForSource(source);
  assert.deepEqual(roots.map(({ name }) => name), [
    'Outer',
    'NotAClassChild',
    'Container',
    'NotAComponentChild',
    'PackageRoot',
    'NamespaceRoot',
  ]);
  assert.equal(roots[0].children, undefined);
  assert.equal(roots[1].children, undefined);
  assert.equal(roots[2].children, undefined);
  assert.equal(roots[3].children, undefined);
  assert.deepEqual(roots[4].children.map(({ name }) => name), ['PackageChild']);
  assert.deepEqual(roots[5].children.map(({ name }) => name), ['NamespaceChild']);
});
