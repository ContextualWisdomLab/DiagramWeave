import assert from 'node:assert/strict';
import test from 'node:test';

import { documentSymbolsForSource } from '../src/symbols.js';

test('ignores braces in a delimited alias after a delimited display label', () => {
  const source = [
    'class "Displayed" as [Alias { Brace]',
    '  class NotAChild',
    '}',
    'package Real {',
    '  class RealChild',
    '}',
  ].join('\n');

  const roots = documentSymbolsForSource(source);
  assert.deepEqual(roots.map(({ name }) => name), [
    'Displayed',
    'NotAChild',
    'Real',
  ]);
  assert.equal(roots[0].children, undefined);
  assert.equal(roots[1].children, undefined);
  assert.deepEqual(roots[2].children.map(({ name }) => name), ['RealChild']);
});
