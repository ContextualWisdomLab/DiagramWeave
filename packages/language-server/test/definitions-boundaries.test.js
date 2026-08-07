import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { definitionForSource } from '../src/definitions.js';

const uri = 'file:///workspace/definitions-boundaries.puml';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

test('uses inclusive starts, exclusive ends, and structural segment bounds', () => {
  const source = [
    'class Target',
    'class Other',
    'Target --> Other : label',
  ].join('\n');
  const target = {
    uri,
    range: {
      start: { line: 0, character: 6 },
      end: { line: 0, character: 12 },
    },
  };
  const other = {
    uri,
    range: {
      start: { line: 1, character: 6 },
      end: { line: 1, character: 11 },
    },
  };

  assert.deepEqual(definitionForSource(source, uri, { line: 2, character: 0 }), target);
  assert.deepEqual(definitionForSource(source, uri, { line: 2, character: 5 }), target);
  assert.equal(definitionForSource(source, uri, { line: 2, character: 6 }), null);
  assert.deepEqual(definitionForSource(source, uri, { line: 2, character: 11 }), other);
  assert.deepEqual(definitionForSource(source, uri, { line: 2, character: 15 }), other);
  assert.equal(definitionForSource(source, uri, { line: 2, character: 16 }), null);
  assert.equal(definitionForSource(source, uri, { line: 2, character: 24 }), null);
});

test('flattens nested symbols and preserves local URI spelling', () => {
  const documentUri = 'file://localhost/workspace/nested.plantuml';
  const source = [
    'package Outer {',
    '  namespace Inner {',
    '    class Target',
    '  }',
    '}',
    'Target --> Target',
  ].join('\n');

  assert.deepEqual(
    definitionForSource(source, documentUri, { line: 5, character: 2 }),
    {
      uri: documentUri,
      range: {
        start: { line: 2, character: 10 },
        end: { line: 2, character: 16 },
      },
    },
  );
});

test('preserves UTF-16 ranges across LF CRLF and CR snapshots', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const source = [
      'class "😀 Display" as Alias',
      'Alias --> Alias',
    ].join(newline);
    assert.deepEqual(
      definitionForSource(source, uri, { line: 1, character: 2 }),
      {
        uri,
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 17 },
        },
      },
    );
    assert.equal(definitionForSource(source, uri, { line: 1, character: 15 }), null);
  }
});

test('normalizes revoked and throwing position records', () => {
  const source = 'class Target';
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = Object.defineProperty({}, 'line', {
    get() {
      throw new Error('position getter failed');
    },
  });

  for (const position of [revoked.proxy, hostile]) {
    assert.throws(
      () => definitionForSource(source, uri, position),
      (error) => {
        assertError(error, 'document_position_invalid');
        assert.equal(error.field, 'position');
        assert.equal(error.method, 'textDocument/definition');
        assert.equal(error.message.includes(source), false);
        return true;
      },
    );
  }
  assert.equal(definitionForSource(source, uri, { line: 0, character: source.length }), null);
});

test('preserves source and URI validation errors', () => {
  assert.throws(
    () => definitionForSource(null, uri, { line: 0, character: 0 }),
    (error) => assertError(error, 'document_text_invalid'),
  );
  assert.throws(
    () => definitionForSource('class Target', 'https://example.com/target.puml', {
      line: 0,
      character: 0,
    }),
    (error) => assertError(error, 'document_uri_invalid'),
  );
});
