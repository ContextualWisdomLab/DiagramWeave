import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPlainRecord,
  normalizeDocumentText,
  normalizeDocumentUri,
  normalizeDocumentVersion,
  normalizeLanguageId,
  normalizeRendererPath,
  requireSafeString,
} from '../src/contracts.js';
import { LanguageServerError } from '../src/errors.js';
import { languageServerLimits } from '../src/limits.js';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

test('recognizes plain records and rejects hostile or structured values', () => {
  assert.equal(isPlainRecord({}), true);
  assert.equal(isPlainRecord(Object.create(null)), true);
  assert.equal(isPlainRecord(null), false);
  assert.equal(isPlainRecord([]), false);
  assert.equal(isPlainRecord('x'), false);
  assert.equal(isPlainRecord(new Date()), false);
  assert.equal(isPlainRecord(new Proxy({}, {
    getPrototypeOf() {
      throw new Error('trap');
    },
  })), false);
});

test('requires safe strings and absolute renderer paths', () => {
  assert.equal(requireSafeString('safe', 'field'), 'safe');
  for (const value of [null, '', 'bad\u0000value']) {
    assert.throws(() => requireSafeString(value, 'field'), (error) => assertError(error, 'invalid_request'));
  }
  const absolute = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
  assert.equal(normalizeRendererPath(absolute, 'javaPath'), absolute);
  assert.throws(
    () => normalizeRendererPath('relative', 'javaPath'),
    (error) => assertError(error, 'invalid_options'),
  );
});

test('normalizes supported local PlantUML document URIs', () => {
  const values = [
    'file:///workspace/model.puml',
    'file:///workspace/model.PLANTUML',
    'file://localhost/workspace/model.puml',
  ];
  for (const value of values) {
    assert.equal(normalizeDocumentUri(value), value);
  }
  const invalid = [
    'not a URI',
    'https://example.com/model.puml',
    'file://remote.example.com/workspace/model.puml',
    'file://user:pass@localhost/workspace/model.puml',
    'file:///workspace/model.puml?query=1',
    'file:///workspace/model.puml#fragment',
    'file:///workspace/model.txt',
    `file:///workspace/${'a'.repeat(languageServerLimits.maxUriBytes)}.puml`,
  ];
  for (const value of invalid) {
    assert.throws(() => normalizeDocumentUri(value), (error) => assertError(error, 'document_uri_invalid'));
  }
});

test('normalizes document versions, text, and language identifiers', () => {
  assert.equal(normalizeDocumentVersion(0), 0);
  assert.equal(normalizeDocumentVersion(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => normalizeDocumentVersion(value), (error) => assertError(error, 'document_version_invalid'));
  }

  assert.equal(normalizeDocumentText(''), '');
  assert.throws(() => normalizeDocumentText(null), (error) => assertError(error, 'document_text_invalid'));
  assert.throws(
    () => normalizeDocumentText('x'.repeat(languageServerLimits.maxDocumentBytes + 1)),
    (error) => assertError(error, 'document_too_large'),
  );

  assert.equal(normalizeLanguageId('PlantUML'), 'plantuml');
  assert.equal(normalizeLanguageId('puml'), 'puml');
  assert.throws(() => normalizeLanguageId('mermaid'), (error) => assertError(error, 'document_language_unsupported'));
});

test('publishes immutable public limits tied to the renderer default', () => {
  assert.deepEqual(languageServerLimits, {
    maxCompletionItems: 64,
    maxDocumentBytes: 1048576,
    maxDocumentSymbols: 1024,
    maxOpenDocuments: 256,
    maxSymbolNameBytes: 1024,
    maxUriBytes: 4096,
  });
  assert.equal(Object.isFrozen(languageServerLimits), true);
});
