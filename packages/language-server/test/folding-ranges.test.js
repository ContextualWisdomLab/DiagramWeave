import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { languageServerLimits } from '../src/limits.js';
import { foldingRangesForSource } from '../src/folding-ranges.js';

test('returns immutable source-order folds for proven package and namespace scopes', () => {
  const source = [
    'package Platform {',
    '  namespace api {',
    '    class Gateway',
    '  }',
    '  class Worker',
    '}',
    'package External {',
    '  class Port',
    '}',
  ].join('\n');

  const ranges = foldingRangesForSource(source, languageServerLimits.maxDocumentSymbols);
  assert.deepEqual(ranges, [
    { startLine: 0, endLine: 5 },
    { startLine: 1, endLine: 3 },
    { startLine: 6, endLine: 8 },
  ]);
  assert.equal(Object.isFrozen(ranges), true);
  for (const range of ranges) {
    assert.equal(Object.isFrozen(range), true);
    assert.equal('startCharacter' in range, false);
    assert.equal('endCharacter' in range, false);
    assert.equal('kind' in range, false);
    assert.equal('collapsedText' in range, false);
  }
});

test('omits empty, one-line, ambiguous, and non-grouping structural lookalikes', () => {
  const source = [
    'package Empty {',
    '}',
    'package OneLine { }',
    'class NotGrouping {',
    '  class MemberLookingText',
    '}',
    'package "Quoted { Label" as Quoted',
    'package Multi {{',
    '  class NotOwned',
    '}',
    'package CrossIndent {',
    '  class NotCrossOwned',
    '  }',
    "package Commented ' {",
  ].join('\n');

  const first = foldingRangesForSource(source, languageServerLimits.maxDocumentSymbols);
  const second = foldingRangesForSource(source, languageServerLimits.maxDocumentSymbols);
  assert.deepEqual(first, []);
  assert.equal(first, second);
  assert.equal(Object.isFrozen(first), true);
});

test('preserves line ranges across newline conventions and multilingual labels', () => {
  const lines = [
    'package "플랫폼 😀" {',
    '  namespace 데이터 {',
    '    class Gateway',
    '  }',
    '}',
  ];

  for (const separator of ['\n', '\r\n', '\r']) {
    assert.deepEqual(foldingRangesForSource(lines.join(separator), 1024), [
      { startLine: 0, endLine: 4 },
      { startLine: 1, endLine: 3 },
    ]);
  }
});

test('honors deterministic range limits including the shared zero result', () => {
  const source = [
    'package One {',
    '  class First',
    '}',
    'package Two {',
    '  class Second',
    '}',
  ].join('\n');

  const zero = foldingRangesForSource(source, 0);
  assert.deepEqual(zero, []);
  assert.equal(zero, foldingRangesForSource('', 0));
  assert.deepEqual(foldingRangesForSource(source, 1), [
    { startLine: 0, endLine: 2 },
  ]);
  assert.deepEqual(foldingRangesForSource(source, 1024), [
    { startLine: 0, endLine: 2 },
    { startLine: 3, endLine: 5 },
  ]);
  assert.deepEqual(foldingRangesForSource(source, 2_147_483_647), [
    { startLine: 0, endLine: 2 },
    { startLine: 3, endLine: 5 },
  ]);
});

test('preserves authoritative source validation failures', () => {
  assert.throws(
    () => foldingRangesForSource(null, 1024),
    (error) => error instanceof LanguageServerError && error.code === 'document_text_invalid',
  );
  assert.throws(
    () => foldingRangesForSource('x'.repeat(languageServerLimits.maxDocumentBytes + 1), 1024),
    (error) => error instanceof LanguageServerError && error.code === 'document_too_large',
  );
});

test('walks the bounded maximum-depth hierarchy without recursive traversal', () => {
  const depth = 512;
  const lines = [];
  for (let index = 0; index < depth; index += 1) {
    lines.push(`${'  '.repeat(index)}package Scope${index} {`);
  }
  lines.push(`${'  '.repeat(depth)}class Leaf`);
  for (let index = depth - 1; index >= 0; index -= 1) {
    lines.push(`${'  '.repeat(index)}}`);
  }

  const ranges = foldingRangesForSource(lines.join('\n'), depth);
  assert.equal(ranges.length, depth);
  assert.deepEqual(ranges[0], { startLine: 0, endLine: depth * 2 });
  assert.deepEqual(ranges.at(-1), {
    startLine: depth - 1,
    endLine: depth + 1,
  });
  assert.deepEqual(foldingRangesForSource(lines.join('\n'), 3), ranges.slice(0, 3));
});
