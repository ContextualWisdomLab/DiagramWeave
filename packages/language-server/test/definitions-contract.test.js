import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { definitionForSource } from '../src/definitions.js';

const uri = 'file:///workspace/definitions-contract.puml';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

function nthIndexOf(source, needle, occurrence = 0) {
  let index = -1;
  let from = 0;
  for (let current = 0; current <= occurrence; current += 1) {
    index = source.indexOf(needle, from);
    assert.notEqual(index, -1, `missing fixture token: ${needle}`);
    from = index + needle.length;
  }
  return index;
}

function positionOf(source, needle, offset = 0, occurrence = 0) {
  const index = nthIndexOf(source, needle, occurrence) + offset;
  const prefix = source.slice(0, index);
  const newlines = [...prefix.matchAll(/\r\n|\n|\r/gu)];
  const line = newlines.length;
  const lastNewline = newlines[newlines.length - 1];
  const lineStart = lastNewline === undefined
    ? 0
    : lastNewline.index + lastNewline[0].length;
  return { line, character: index - lineStart };
}

function rangeOf(source, needle, occurrence = 0) {
  const start = positionOf(source, needle, 0, occurrence);
  return {
    start,
    end: { line: start.line, character: start.character + needle.length },
  };
}

function expectedLocation(source, display, occurrence = 0, documentUri = uri) {
  return { uri: documentUri, range: rangeOf(source, display, occurrence) };
}

test('resolves bare identifiers and both delimited alias orientations', () => {
  const source = [
    'package Platform {',
    '  class Gateway',
    '  class "Order Service" as OrderService',
    '  participant UserActor as "User"',
    '}',
    'Gateway --> OrderService : submits',
    'UserActor --> Gateway',
  ].join('\n');

  assert.deepEqual(
    definitionForSource(source, uri, positionOf(source, 'Gateway', 2, 1)),
    expectedLocation(source, 'Gateway'),
  );
  assert.deepEqual(
    definitionForSource(source, uri, positionOf(source, 'OrderService', 3, 1)),
    expectedLocation(source, 'Order Service'),
  );
  assert.deepEqual(
    definitionForSource(source, uri, positionOf(source, 'UserActor', 2, 1)),
    expectedLocation(source, 'User'),
  );
});

test('normalizes malformed positions to one source-free definition error', () => {
  const source = 'class Target';
  for (const position of [
    null,
    [],
    {},
    { line: 0 },
    { line: 0.5, character: 0 },
    { line: 0, character: 0.5 },
    { line: -1, character: 0 },
    { line: 0, character: -1 },
    { line: 1, character: 0 },
    { line: 0, character: source.length + 1 },
  ]) {
    assert.throws(
      () => definitionForSource(source, uri, position),
      (error) => {
        assertError(error, 'document_position_invalid');
        assert.equal(error.field, 'position');
        assert.equal(error.method, 'textDocument/definition');
        return true;
      },
    );
  }
});
