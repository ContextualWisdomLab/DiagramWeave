import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diagnosticsFromRendererError,
  sanitizeRendererDiagnostics,
} from '../src/diagnostics.js';

function diagnostic(line = 1) {
  return {
    range: {
      start: { line, character: 0 },
      end: { line, character: 0 },
    },
    severity: 1,
    code: 'plantuml.syntax',
    source: 'plantuml',
    message: 'PlantUML reported a syntax error.',
    data: { plantUmlLineNumber: line + 1 },
  };
}

function assertDeeplyFrozen(diagnostics) {
  assert.equal(Object.isFrozen(diagnostics), true);
  for (const item of diagnostics) {
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.range), true);
    assert.equal(Object.isFrozen(item.range.start), true);
    assert.equal(Object.isFrozen(item.range.end), true);
    assert.equal(Object.isFrozen(item.data), true);
  }
}

test('clones and deeply freezes the renderer diagnostic contract', () => {
  const source = [diagnostic(4), diagnostic(8)];
  const sanitized = sanitizeRendererDiagnostics(source);
  assert.deepEqual(sanitized, source);
  assert.notEqual(sanitized, source);
  assert.notEqual(sanitized[0], source[0]);
  assertDeeplyFrozen(sanitized);

  source[0].range.start.line = 999;
  assert.equal(sanitized[0].range.start.line, 4);
});

test('returns one shared frozen empty collection for missing or oversized input', () => {
  const first = sanitizeRendererDiagnostics(undefined);
  const second = sanitizeRendererDiagnostics(null);
  assert.deepEqual(first, []);
  assert.equal(first, second);
  assert.equal(first, sanitizeRendererDiagnostics({}));
  assert.equal(first, sanitizeRendererDiagnostics([]));
  assert.equal(first, sanitizeRendererDiagnostics(Array.from({ length: 33 }, () => diagnostic())));
  assert.equal(Object.isFrozen(first), true);
});

test('rejects every malformed diagnostic field without leaking dynamic values', () => {
  const valid = diagnostic();
  const malformed = [
    [null],
    ['diagnostic'],
    [{ ...valid, range: null }],
    [{ ...valid, range: { ...valid.range, start: null } }],
    [{ ...valid, range: { ...valid.range, end: null } }],
    [{ ...valid, range: { ...valid.range, start: { line: '1', character: 0 } } }],
    [{ ...valid, range: { ...valid.range, start: { line: -1, character: 0 } } }],
    [{ ...valid, range: { ...valid.range, start: { line: 2_147_483_648, character: 0 } } }],
    [{ ...valid, range: { ...valid.range, start: { line: 0, character: 1 } } }],
    [{ ...valid, range: { ...valid.range, end: { line: 2, character: 0 } }],
    [{ ...valid, severity: 2 }],
    [{ ...valid, code: 'private.source' }],
    [{ ...valid, source: 'other' }],
    [{ ...valid, message: 'Alice -> Bob' }],
    [{ ...valid, data: null }],
    [{ ...valid, data: { plantUmlLineNumber: 99 } }],
  ];
  const empty = sanitizeRendererDiagnostics(undefined);
  for (const value of malformed) {
    assert.equal(sanitizeRendererDiagnostics(value), empty);
  }
});

test('fails closed for hostile property access', () => {
  const hostile = new Proxy({}, {
    get() {
      throw new Error('private source');
    },
  });
  assert.deepEqual(sanitizeRendererDiagnostics([hostile]), []);
});

test('extracts renderer diagnostics and isolates hostile error getters', () => {
  const expected = sanitizeRendererDiagnostics([diagnostic(2)]);
  assert.deepEqual(
    diagnosticsFromRendererError({ diagnostics: [diagnostic(2)] }),
    expected,
  );
  const empty = sanitizeRendererDiagnostics(undefined);
  assert.equal(diagnosticsFromRendererError(null), empty);
  assert.equal(diagnosticsFromRendererError('error'), empty);
  const hostile = Object.defineProperty({}, 'diagnostics', {
    get() {
      throw new Error('private source');
    },
  });
  assert.equal(diagnosticsFromRendererError(hostile), empty);
});
