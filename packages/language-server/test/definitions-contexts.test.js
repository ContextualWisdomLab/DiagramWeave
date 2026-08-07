import assert from 'node:assert/strict';
import test from 'node:test';

import { definitionForSource } from '../src/definitions.js';

const uri = 'file:///workspace/definitions-contexts.puml';
const targetLocation = {
  uri,
  range: {
    start: { line: 0, character: 6 },
    end: { line: 0, character: 12 },
  },
};

function inside(lines, line, token, occurrence = 0) {
  let index = -1;
  let from = 0;
  for (let current = 0; current <= occurrence; current += 1) {
    index = lines[line].indexOf(token, from);
    assert.notEqual(index, -1);
    from = index + token.length;
  }
  return { line, character: index + Math.min(1, token.length - 1) };
}

test('masks comments, quoted narrative, directives, and relation labels', () => {
  const lines = [
    'class Target',
    "' Target --> Target",
    "/'",
    'Target --> Target',
    "'/",
    '"Target" --> Target',
    '@note Target',
    '!define Alias Target',
    'Target : Target',
    'Target --> Missing : Target',
  ];
  const source = lines.join('\n');

  assert.equal(definitionForSource(source, uri, inside(lines, 1, 'Target')), null);
  assert.equal(definitionForSource(source, uri, inside(lines, 3, 'Target')), null);
  assert.equal(definitionForSource(source, uri, inside(lines, 5, 'Target')), null);
  assert.deepEqual(
    definitionForSource(source, uri, inside(lines, 5, 'Target', 1)),
    targetLocation,
  );
  assert.equal(definitionForSource(source, uri, inside(lines, 6, 'Target')), null);
  assert.equal(definitionForSource(source, uri, inside(lines, 7, 'Target')), null);
  assert.deepEqual(definitionForSource(source, uri, inside(lines, 8, 'Target')), targetLocation);
  assert.equal(definitionForSource(source, uri, inside(lines, 8, 'Target', 1)), null);
  assert.deepEqual(definitionForSource(source, uri, inside(lines, 9, 'Target')), targetLocation);
  assert.equal(definitionForSource(source, uri, inside(lines, 9, 'Missing')), null);
  assert.equal(definitionForSource(source, uri, inside(lines, 9, 'Target', 1)), null);
});

test('keeps escaped and doubled quotes masked without hiding later references', () => {
  const lines = [
    'class Target',
    '"Escaped \\" quote" --> Target',
    '"Doubled "" quote" --> Target',
    '"Target" Target',
  ];
  const source = lines.join('\n');

  assert.deepEqual(
    definitionForSource(source, uri, inside(lines, 1, 'Target')),
    targetLocation,
  );
  assert.deepEqual(
    definitionForSource(source, uri, inside(lines, 2, 'Target')),
    targetLocation,
  );
  assert.equal(definitionForSource(source, uri, inside(lines, 3, 'Target')), null);
  assert.equal(definitionForSource(source, uri, inside(lines, 3, 'Target', 1)), null);
});

test('supports every bounded relation operator and member-owner shorthand', () => {
  const operators = ['<|--', '--|>', '<|..', '..|>', '<--', '-->', '<-', '->', '--', '..'];
  const lines = [
    'class Target',
    'class Other',
    ...operators.map((operator) => `Target ${operator} Other`),
    'Target : member',
    'Target Other',
  ];
  const source = lines.join('\n');

  for (let index = 0; index < operators.length; index += 1) {
    assert.deepEqual(
      definitionForSource(source, uri, { line: index + 2, character: 2 }),
      targetLocation,
    );
  }
  assert.deepEqual(
    definitionForSource(source, uri, { line: operators.length + 2, character: 2 }),
    targetLocation,
  );
  assert.equal(
    definitionForSource(source, uri, { line: operators.length + 3, character: 2 }),
    null,
  );
});
