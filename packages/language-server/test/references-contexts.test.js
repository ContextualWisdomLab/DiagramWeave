import assert from 'node:assert/strict';
import test from 'node:test';

import { referencesForSource } from '../src/definitions.js';

const uri = 'file:///workspace/contexts.puml';

function location(line, start, end) {
  return {
    uri,
    range: {
      start: { line, character: start },
      end: { line, character: end },
    },
  };
}

test('collects bare identifiers and both supported alias orientations', () => {
  const source = [
    '@startuml',
    'class Alpha',
    'class "Beta Service" as Beta',
    'participant Gamma as "Gamma User"',
    'Alpha --> Beta : Gamma is only label text',
    'Beta --> Gamma',
    'Alpha : run()',
    '@enduml',
    '',
  ].join('\n');

  assert.deepEqual(
    referencesForSource(source, uri, { line: 4, character: 1 }, true),
    [location(1, 6, 11), location(4, 0, 5), location(6, 0, 5)],
  );
  assert.deepEqual(
    referencesForSource(source, uri, { line: 2, character: 25 }, false),
    [location(4, 10, 14), location(5, 0, 4)],
  );
  assert.deepEqual(
    referencesForSource(source, uri, { line: 3, character: 13 }, true),
    [location(3, 22, 32), location(5, 9, 14)],
  );
});

test('masks comments quoted narrative directives and relation labels', () => {
  const source = [
    '@startuml',
    'class Alpha',
    'class Beta',
    'Alpha --> Beta : Alpha Beta',
    "' Alpha --> Beta",
    "/' Alpha --> Beta",
    "Beta --> Alpha '/",
    'note "Alpha --> Beta"',
    '!define Alpha Beta',
    'Alpha : execute()',
    '@enduml',
    '',
  ].join('\n');

  assert.deepEqual(
    referencesForSource(source, uri, { line: 3, character: 1 }, false),
    [location(3, 0, 5), location(9, 0, 5)],
  );
  assert.deepEqual(
    referencesForSource(source, uri, { line: 3, character: 10 }, false),
    [location(3, 10, 14)],
  );
  assert.deepEqual(
    referencesForSource(source, uri, { line: 3, character: 17 }, false),
    [],
  );
});

test('fails by omission for implicit malformed and duplicate identities', () => {
  const source = [
    '@startuml',
    'class BothBare as AmbiguousBare',
    'class "Both Delimited" as "Other Delimited"',
    'class Duplicate',
    'component Duplicate',
    'Implicit --> Duplicate',
    'BothBare --> AmbiguousBare',
    '@enduml',
    '',
  ].join('\n');

  const results = [
    referencesForSource(source, uri, { line: 5, character: 1 }, true),
    referencesForSource(source, uri, { line: 5, character: 13 }, true),
    referencesForSource(source, uri, { line: 6, character: 1 }, true),
    referencesForSource(source, uri, { line: 6, character: 13 }, true),
  ];

  for (const result of results) {
    assert.deepEqual(result, []);
  }
});

test('orders predeclaration and same-line references and omits relation operators', () => {
  const source = [
    '@startuml',
    'Target --> Target',
    'class Target',
    'Target : run()',
    '@enduml',
    '',
  ].join('\n');

  assert.deepEqual(
    referencesForSource(source, uri, { line: 1, character: 1 }, true),
    [
      location(1, 0, 6),
      location(1, 11, 17),
      location(2, 6, 12),
      location(3, 0, 6),
    ],
  );
  assert.deepEqual(
    referencesForSource(source, uri, { line: 1, character: 8 }, true),
    [],
  );
});
