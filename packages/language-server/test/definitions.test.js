import assert from 'node:assert/strict';
import test from 'node:test';

import { definitionForSource } from '../src/definitions.js';

const uri = 'file:///workspace/definitions.puml';

test('navigates one explicit PlantUML alias reference to its authoritative declaration', () => {
  const source = [
    '@startuml',
    'class "Order Service" as OrderService',
    'class Customer',
    'Customer --> OrderService : submits',
    '@enduml',
  ].join('\n');

  assert.deepEqual(definitionForSource(source, uri, { line: 3, character: 16 }), {
    uri,
    range: {
      start: { line: 1, character: 7 },
      end: { line: 1, character: 20 },
    },
  });
});

test('returns null for valid source positions without a unique explicit identifier', () => {
  const source = [
    '@startuml',
    'class Customer',
    'Customer --> Missing : no definition',
    '@enduml',
  ].join('\n');

  assert.equal(definitionForSource(source, uri, { line: 2, character: 15 }), null);
});
