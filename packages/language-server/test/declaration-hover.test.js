import assert from 'node:assert/strict';
import test from 'node:test';

import { declarationHoverForSource } from '../src/declaration-hover.js';
import { LanguageServerError } from '../src/errors.js';
import { languageServerLimits } from '../src/limits.js';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

test('returns immutable plaintext hover for exact authoritative declaration labels', () => {
  const source = [
    'package Platform {',
    '  namespace api {',
    '    abstract class "API Gateway" as Gateway',
    '  }',
    '}',
    'component RootComponent',
  ].join('\n');

  const nested = declarationHoverForSource(
    source,
    { line: 2, character: 21 },
    'plaintext',
  );
  assert.deepEqual(nested, {
    contents: {
      kind: 'plaintext',
      value: [
        'PlantUML abstract class declaration',
        'Name: API Gateway',
        'Container: api',
      ].join('\n'),
    },
    range: {
      start: { line: 2, character: 20 },
      end: { line: 2, character: 31 },
    },
  });
  assert.equal(Object.isFrozen(nested), true);
  assert.equal(Object.isFrozen(nested.contents), true);
  assert.equal(Object.isFrozen(nested.range), true);
  assert.equal(Object.isFrozen(nested.range.start), true);
  assert.equal(Object.isFrozen(nested.range.end), true);

  assert.deepEqual(
    declarationHoverForSource(source, { line: 5, character: 10 }, 'plaintext'),
    {
      contents: {
        kind: 'plaintext',
        value: 'PlantUML component declaration\nName: RootComponent',
      },
      range: {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 23 },
      },
    },
  );
});

test('uses inclusive starts exclusive ends and returns null outside exact labels', () => {
  const source = [
    '@startuml',
    "' class Commented",
    'class Alpha {',
    '  +method()',
    '}',
    'Alpha --> Beta',
    '!include remote.puml',
    'package Broken {',
  ].join('\n');

  assert.notEqual(
    declarationHoverForSource(source, { line: 2, character: 6 }, 'plaintext'),
    null,
  );
  assert.equal(
    declarationHoverForSource(source, { line: 2, character: 11 }, 'plaintext'),
    null,
  );
  for (const position of [
    { line: 0, character: 1 },
    { line: 1, character: 8 },
    { line: 2, character: 1 },
    { line: 3, character: 4 },
    { line: 4, character: 0 },
    { line: 5, character: 2 },
    { line: 6, character: 2 },
    { line: 7, character: 14 },
  ]) {
    assert.equal(declarationHoverForSource(source, position, 'plaintext'), null);
  }
});

test('preserves UTF-16 label ranges across newline conventions and aliases', () => {
  const lines = [
    'package "플랫폼 😀" {',
    '  class Gateway as "게이트웨이 😀"',
    '}',
  ];
  const expectedStart = lines[1].indexOf('게');
  const expectedEnd = expectedStart + '게이트웨이 😀'.length;

  for (const separator of ['\n', '\r\n', '\r']) {
    const hover = declarationHoverForSource(
      lines.join(separator),
      { line: 1, character: expectedStart + 1 },
      'plaintext',
    );
    assert.deepEqual(hover, {
      contents: {
        kind: 'plaintext',
        value: [
          'PlantUML class declaration',
          'Name: 게이트웨이 😀',
          'Container: 플랫폼 😀',
        ].join('\n'),
      },
      range: {
        start: { line: 1, character: expectedStart },
        end: { line: 1, character: expectedEnd },
      },
    });
  }
});

test('fences markdown with a delimiter longer than declaration content', () => {
  const source = [
    'package "Outer ```` Scope" {',
    '  class "Tick ``` label"',
    '}',
  ].join('\n');
  const character = source.split('\n')[1].indexOf('Tick') + 1;
  const hover = declarationHoverForSource(source, { line: 1, character }, 'markdown');

  assert.equal(hover.contents.kind, 'markdown');
  assert.equal(
    hover.contents.value,
    [
      '`````text',
      'PlantUML class declaration',
      'Name: Tick ``` label',
      'Container: Outer ```` Scope',
      '`````',
    ].join('\n'),
  );
  assert.equal(Object.isFrozen(hover.contents), true);
});

test('validates markup kind and every source position without leaking hostile values', () => {
  const source = 'class Alpha';
  assert.throws(
    () => declarationHoverForSource(source, { line: 0, character: 6 }, 'html'),
    (error) => assertError(error, 'invalid_request'),
  );

  for (const position of [
    null,
    [],
    {},
    { line: -1, character: 0 },
    { line: 0.5, character: 0 },
    { line: 0, character: -1 },
    { line: 0, character: 99 },
    { line: 1, character: 0 },
    { line: Number.MAX_SAFE_INTEGER + 1, character: 0 },
  ]) {
    assert.throws(
      () => declarationHoverForSource(source, position, 'plaintext'),
      (error) => assertError(error, 'document_position_invalid'),
    );
  }

  const hostileLine = Object.defineProperty({}, 'line', {
    get() {
      throw new Error('secret line');
    },
  });
  assert.throws(
    () => declarationHoverForSource(source, hostileLine, 'plaintext'),
    (error) => assertError(error, 'document_position_invalid'),
  );

  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.throws(
    () => declarationHoverForSource(source, proxy, 'plaintext'),
    (error) => assertError(error, 'document_position_invalid'),
  );
});

test('preserves authoritative source bounds and symbol validation failures', () => {
  assert.throws(
    () => declarationHoverForSource(null, { line: 0, character: 0 }, 'plaintext'),
    (error) => assertError(error, 'document_text_invalid'),
  );
  assert.throws(
    () => declarationHoverForSource(
      'x'.repeat(languageServerLimits.maxDocumentBytes + 1),
      { line: 0, character: 0 },
      'plaintext',
    ),
    (error) => assertError(error, 'document_too_large'),
  );
  const oversizedName = `class ${'x'.repeat(languageServerLimits.maxSymbolNameBytes + 1)}`;
  assert.throws(
    () => declarationHoverForSource(
      oversizedName,
      { line: 0, character: 6 },
      'plaintext',
    ),
    (error) => assertError(error, 'document_symbol_name_too_large'),
  );
});

test('walks the bounded maximum-depth symbol hierarchy without recursion', () => {
  const depth = 512;
  const lines = [];
  for (let index = 0; index < depth; index += 1) {
    lines.push(`${'  '.repeat(index)}package Scope${index} {`);
  }
  const leafLine = lines.length;
  const leafText = `${'  '.repeat(depth)}class Leaf`;
  lines.push(leafText);
  for (let index = depth - 1; index >= 0; index -= 1) {
    lines.push(`${'  '.repeat(index)}}`);
  }

  const hover = declarationHoverForSource(
    lines.join('\n'),
    { line: leafLine, character: leafText.indexOf('Leaf') + 1 },
    'plaintext',
  );
  assert.deepEqual(hover.contents, {
    kind: 'plaintext',
    value: [
      'PlantUML class declaration',
      'Name: Leaf',
      `Container: Scope${depth - 1}`,
    ].join('\n'),
  });
});
