import assert from 'node:assert/strict';
import test from 'node:test';

import { referencesForSource } from '../src/definitions.js';

const uri = 'file:///workspace/model.puml';

const source = [
  '@startuml',
  'class "Order Service" as OrderService',
  'actor Customer',
  'Customer --> OrderService : submits',
  'OrderService : submit()',
  '@enduml',
  '',
].join('\n');

const declarationLocation = Object.freeze({
  uri,
  range: Object.freeze({
    start: Object.freeze({ line: 1, character: 7 }),
    end: Object.freeze({ line: 1, character: 20 }),
  }),
});

const relationLocation = Object.freeze({
  uri,
  range: Object.freeze({
    start: Object.freeze({ line: 3, character: 13 }),
    end: Object.freeze({ line: 3, character: 25 }),
  }),
});

const ownerLocation = Object.freeze({
  uri,
  range: Object.freeze({
    start: Object.freeze({ line: 4, character: 0 }),
    end: Object.freeze({ line: 4, character: 12 }),
  }),
});

test('returns immutable source-order references with the declaration included', () => {
  const references = referencesForSource(
    source,
    uri,
    { line: 3, character: 15 },
    true,
  );

  assert.deepEqual(references, [declarationLocation, relationLocation, ownerLocation]);
  assert.equal(Object.isFrozen(references), true);
  for (const location of references) {
    assert.equal(Object.isFrozen(location), true);
    assert.equal(Object.isFrozen(location.range), true);
    assert.equal(Object.isFrozen(location.range.start), true);
    assert.equal(Object.isFrozen(location.range.end), true);
  }
});

test('excludes the declaration when requested and resolves every supported cursor form', () => {
  const expected = [relationLocation, ownerLocation];
  const positions = [
    { line: 1, character: 8 },
    { line: 1, character: 29 },
    { line: 3, character: 15 },
    { line: 4, character: 2 },
  ];

  for (const position of positions) {
    assert.deepEqual(referencesForSource(source, uri, position, false), expected);
  }
});

test('returns one shared empty result for valid positions without a unique identifier', () => {
  const duplicateSource = [
    '@startuml',
    'class Duplicate',
    'component Duplicate',
    'Duplicate --> Duplicate',
    '@enduml',
    '',
  ].join('\n');

  const first = referencesForSource(duplicateSource, uri, { line: 3, character: 1 }, true);
  const second = referencesForSource(source, uri, { line: 0, character: 0 }, true);

  assert.deepEqual(first, []);
  assert.equal(first, second);
  assert.equal(Object.isFrozen(first), true);
});
