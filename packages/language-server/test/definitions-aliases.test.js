import assert from 'node:assert/strict';
import test from 'node:test';

import { languageServerLimits } from '../src/limits.js';
import { definitionForSource } from '../src/definitions.js';

const uri = 'file:///workspace/definitions-aliases.puml';

function position(source, token, occurrence = 0, offset = 1) {
  let index = -1;
  let from = 0;
  for (let current = 0; current <= occurrence; current += 1) {
    index = source.indexOf(token, from);
    assert.notEqual(index, -1);
    from = index + token.length;
  }
  index += offset;
  const before = source.slice(0, index);
  const newlines = [...before.matchAll(/\r\n|\n|\r/gu)];
  const last = newlines[newlines.length - 1];
  const lineStart = last === undefined ? 0 : last.index + last[0].length;
  return { line: newlines.length, character: index - lineStart };
}

function range(source, token, occurrence = 0) {
  const start = position(source, token, occurrence, 0);
  return {
    start,
    end: { line: start.line, character: start.character + token.length },
  };
}

function location(source, display, occurrence = 0) {
  return { uri, range: range(source, display, occurrence) };
}

test('supports every approved delimited display form', () => {
  const source = [
    'class "Quoted Name" as Quoted',
    'usecase (Check Out) as Checkout',
    'component [API Edge] as ApiEdge',
    'actor :Human User: as Human',
    'Quoted --> Checkout',
    'ApiEdge --> Human',
  ].join('\n');

  for (const [reference, display, occurrence] of [
    ['Quoted', 'Quoted Name', 1],
    ['Checkout', 'Check Out', 1],
    ['ApiEdge', 'API Edge', 1],
    ['Human', 'Human User', 1],
  ]) {
    assert.deepEqual(
      definitionForSource(source, uri, position(source, reference, occurrence)),
      location(source, display),
    );
  }
});

test('preserves escaped and doubled quote declarations', () => {
  const source = [
    'class "Escaped \\" quote" as Escaped',
    'class "Doubled "" quote" as Doubled',
    'Escaped --> Doubled',
  ].join('\n');

  assert.deepEqual(
    definitionForSource(source, uri, position(source, 'Escaped', 1)),
    location(source, 'Escaped \\" quote'),
  );
  assert.deepEqual(
    definitionForSource(source, uri, position(source, 'Doubled', 1)),
    location(source, 'Doubled "" quote'),
  );
});

test('navigates declaration display and alias ranges directly', () => {
  const source = [
    'class "Order Service" as OrderService',
    'participant UserActor as "User"',
  ].join('\n');

  assert.deepEqual(
    definitionForSource(source, uri, position(source, 'Order Service')),
    location(source, 'Order Service'),
  );
  assert.deepEqual(
    definitionForSource(source, uri, position(source, 'OrderService')),
    location(source, 'Order Service'),
  );
  assert.deepEqual(
    definitionForSource(source, uri, position(source, 'UserActor')),
    location(source, 'User', 1),
  );
  assert.deepEqual(
    definitionForSource(source, uri, position(source, 'User', 1)),
    location(source, 'User', 1),
  );
});

test('fails closed for duplicate malformed and unsupported alias forms', () => {
  const oversizedAlias = `Alias${'x'.repeat(languageServerLimits.maxSymbolNameBytes)}`;
  const source = [
    'class First',
    'class "Second" as First',
    'class BareDisplay as BareAlias',
    'class MissingAlias as ',
    'class "Unterminated Alias" as "unterminated',
    'class "Angle Alias" as <invalid',
    'class "Unsafe" as 9unsafe',
    `class "Oversized" as ${oversizedAlias}`,
    'First --> First',
    'BareAlias --> MissingAlias',
    'unterminated --> invalid',
    'unsafe --> Missing',
    `${oversizedAlias} --> Missing`,
  ].join('\n');

  assert.equal(definitionForSource(source, uri, position(source, 'First', 2)), null);
  assert.equal(definitionForSource(source, uri, position(source, 'BareAlias', 1)), null);
  assert.equal(definitionForSource(source, uri, position(source, 'MissingAlias', 1)), null);
  assert.equal(definitionForSource(source, uri, position(source, 'unterminated', 1)), null);
  assert.equal(definitionForSource(source, uri, position(source, 'invalid', 1)), null);
  assert.equal(definitionForSource(source, uri, position(source, 'unsafe', 1)), null);
  assert.equal(definitionForSource(source, uri, position(source, oversizedAlias, 1)), null);
});
