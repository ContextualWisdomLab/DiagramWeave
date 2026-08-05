import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { languageServerLimits } from '../src/limits.js';
import { completionItemsForSource } from '../src/completions.js';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

function labels(items) {
  return items.map(({ label }) => label);
}

test('returns a deterministic bounded declaration catalog at an empty line', () => {
  const items = completionItemsForSource('@startuml\n\n@enduml\n', {
    line: 1,
    character: 0,
  });
  assert.equal(items.length <= languageServerLimits.maxCompletionItems, true);
  assert.deepEqual(labels(items).slice(0, 5), [
    '@startuml',
    '@enduml',
    'package',
    'namespace',
    'class',
  ]);
  assert.deepEqual(labels(items).slice(-4), ['rectangle', 'usecase', 'state', 'abstract class']);
  assert.equal(Object.isFrozen(items), true);
  for (const item of items) {
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.textEdit), true);
    assert.equal(Object.isFrozen(item.textEdit.range), true);
    assert.equal(Object.isFrozen(item.textEdit.range.start), true);
    assert.equal(Object.isFrozen(item.textEdit.range.end), true);
    assert.equal(item.kind, 14);
    assert.equal(item.insertTextFormat, 1);
    assert.equal(item.detail, 'PlantUML declaration keyword');
    assert.equal(item.filterText, item.label);
    assert.equal(item.textEdit.newText, item.label);
  }
});

test('filters case-insensitively and replaces only the leading typed prefix', () => {
  const classItems = completionItemsForSource('  CL Foo', { line: 0, character: 4 });
  assert.deepEqual(labels(classItems), ['class', 'cloud']);
  assert.deepEqual(classItems[0].textEdit, {
    range: {
      start: { line: 0, character: 2 },
      end: { line: 0, character: 4 },
    },
    newText: 'class',
  });

  const abstractItems = completionItemsForSource('  abstra', { line: 0, character: 8 });
  assert.deepEqual(labels(abstractItems), ['abstract class']);
  assert.deepEqual(abstractItems[0].textEdit.range, {
    start: { line: 0, character: 2 },
    end: { line: 0, character: 8 },
  });

  assert.deepEqual(labels(completionItemsForSource('@sta', { line: 0, character: 4 })), ['@startuml']);
});

test('preserves UTF-16 line and character positions across newline conventions', () => {
  const source = 'participant "😀 User"\r\n\tcom\rstate Done\n';
  const component = completionItemsForSource(source, { line: 1, character: 4 });
  assert.deepEqual(labels(component), ['component']);
  assert.deepEqual(component[0].textEdit.range, {
    start: { line: 1, character: 1 },
    end: { line: 1, character: 4 },
  });
  assert.deepEqual(labels(completionItemsForSource(source, { line: 2, character: 2 })), ['stack', 'storage', 'state']);
});

test('suppresses completions in comments strings relations directives and completed declarations', () => {
  const cases = [
    ["' cla", { line: 0, character: 5 }],
    ["/'\ncla\n'/", { line: 1, character: 3 }],
    ['class "cla', { line: 0, character: 10 }],
    ['class "A""B" cla', { line: 0, character: 16 }],
    ['class "A\\\"B" cla', { line: 0, character: 16 }],
    ['Alice -> cla', { line: 0, character: 12 }],
    ['!include cla', { line: 0, character: 12 }],
    ['skinparam cla', { line: 0, character: 13 }],
    ['class Customer', { line: 0, character: 14 }],
    ['class', { line: 0, character: 2 }],
  ];
  for (const [source, position] of cases) {
    assert.deepEqual(completionItemsForSource(source, position), []);
  }
});

test('resumes completion after a block comment closes on an earlier line', () => {
  const source = "/' hidden '/  par";
  assert.deepEqual(
    labels(completionItemsForSource(source, { line: 0, character: source.length })),
    [],
  );

  const multiline = "/'\nhidden\n'/\npar";
  assert.deepEqual(
    labels(completionItemsForSource(multiline, { line: 3, character: 3 })),
    ['participant'],
  );
});

test('returns one shared immutable empty collection for nonmatching safe contexts', () => {
  const first = completionItemsForSource('class Customer', { line: 0, character: 14 });
  const second = completionItemsForSource('Alice -> Bob', { line: 0, character: 12 });
  assert.equal(first, second);
  assert.equal(Object.isFrozen(first), true);
});

test('rejects invalid source positions oversized source and hostile position records', () => {
  assert.throws(
    () => completionItemsForSource(null, { line: 0, character: 0 }),
    (error) => assertError(error, 'document_text_invalid'),
  );
  assert.throws(
    () => completionItemsForSource('x'.repeat(languageServerLimits.maxDocumentBytes + 1), {
      line: 0,
      character: 0,
    }),
    (error) => assertError(error, 'document_too_large'),
  );
  for (const position of [
    null,
    [],
    {},
    { line: -1, character: 0 },
    { line: 0.5, character: 0 },
    { line: 1, character: 0 },
    { line: 0, character: -1 },
    { line: 0, character: 4 },
  ]) {
    assert.throws(
      () => completionItemsForSource('abc', position),
      (error) => assertError(error, 'document_position_invalid'),
    );
  }
  const hostile = new Proxy({}, {
    get() {
      throw new Error('position secret');
    },
  });
  assert.throws(
    () => completionItemsForSource('abc', hostile),
    (error) => assertError(error, 'document_position_invalid'),
  );
});
