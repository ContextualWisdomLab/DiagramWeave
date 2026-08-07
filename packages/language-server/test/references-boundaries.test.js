import assert from 'node:assert/strict';
import test from 'node:test';

import { referencesForSource } from '../src/definitions.js';
import { LanguageServerError } from '../src/errors.js';

const uri = 'file:///workspace/boundaries.puml';

function assertCode(expectedCode) {
  return (error) => {
    assert.equal(error instanceof LanguageServerError, true);
    assert.equal(error.code, expectedCode);
    assert.equal(String(error.message).includes('boundaries.puml'), false);
    return true;
  };
}

test('preserves UTF-16 ranges across newline conventions and multilingual identifiers', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const source = [
      '@startuml',
      'class "😀 서비스" as 주문서비스',
      'actor 고객',
      '고객 --> 주문서비스 : 요청',
      '주문서비스 : 처리()',
      '@enduml',
      '',
    ].join(newline);

    assert.deepEqual(
      referencesForSource(source, uri, { line: 3, character: 8 }, true),
      [
        {
          uri,
          range: {
            start: { line: 1, character: 7 },
            end: { line: 1, character: 13 },
          },
        },
        {
          uri,
          range: {
            start: { line: 3, character: 7 },
            end: { line: 3, character: 12 },
          },
        },
        {
          uri,
          range: {
            start: { line: 4, character: 0 },
            end: { line: 4, character: 5 },
          },
        },
      ],
    );
  }
});

test('accepts the exact reference ceiling and rejects overflow without truncation', () => {
  const supportedLines = ['@startuml', 'class Target'];
  for (let index = 0; index < 4_095; index += 1) {
    supportedLines.push('Target --> Target');
  }
  supportedLines.push('@enduml', '');
  const supportedSource = supportedLines.join('\n');

  const references = referencesForSource(
    supportedSource,
    uri,
    { line: 2, character: 1 },
    true,
  );
  assert.equal(references.length, 4_096);
  assert.deepEqual(references[0].range, {
    start: { line: 1, character: 6 },
    end: { line: 1, character: 12 },
  });
  assert.deepEqual(references.at(-1).range, {
    start: { line: 4_096, character: 10 },
    end: { line: 4_096, character: 16 },
  });

  const overflowLines = ['@startuml', 'class Target'];
  for (let index = 0; index < 4_096; index += 1) {
    overflowLines.push('Target --> Target');
  }
  overflowLines.push('@enduml', '');
  assert.throws(
    () => referencesForSource(
      overflowLines.join('\n'),
      uri,
      { line: 2, character: 1 },
      true,
    ),
    assertCode('reference_limit_exceeded'),
  );
});

test('validates source URI position and include-declaration contracts', () => {
  const source = '@startuml\nclass Target\nTarget --> Target\n@enduml\n';

  assert.throws(
    () => referencesForSource(null, uri, { line: 2, character: 1 }, true),
    assertCode('document_text_invalid'),
  );
  assert.throws(
    () => referencesForSource(source, 'https://example.com/model.puml', { line: 2, character: 1 }, true),
    assertCode('document_uri_invalid'),
  );
  assert.throws(
    () => referencesForSource(source, uri, null, true),
    assertCode('document_position_invalid'),
  );
  assert.throws(
    () => referencesForSource(source, uri, { line: 99, character: 0 }, true),
    assertCode('document_position_invalid'),
  );
  assert.throws(
    () => referencesForSource(source, uri, { line: 2, character: 1 }, 'true'),
    assertCode('invalid_request'),
  );

  const revokedPosition = Proxy.revocable({ line: 2, character: 1 }, {});
  revokedPosition.revoke();
  assert.throws(
    () => referencesForSource(source, uri, revokedPosition.proxy, true),
    assertCode('document_position_invalid'),
  );
});

test('walks the bounded maximum hierarchy without recursive reference traversal', () => {
  const lines = ['@startuml'];
  for (let depth = 0; depth < 512; depth += 1) {
    lines.push(`${'  '.repeat(depth)}package Layer${depth} {`);
  }
  lines.push(`${'  '.repeat(512)}class DeepTarget`);
  lines.push(`${'  '.repeat(512)}DeepTarget --> DeepTarget`);
  for (let depth = 511; depth >= 0; depth -= 1) {
    lines.push(`${'  '.repeat(depth)}}`);
  }
  lines.push('@enduml', '');
  const source = lines.join('\n');
  const relationLine = 514;
  const firstStart = 1_024;

  const references = referencesForSource(
    source,
    uri,
    { line: relationLine, character: firstStart + 1 },
    true,
  );

  assert.equal(references.length, 3);
  assert.deepEqual(references[1].range, {
    start: { line: relationLine, character: firstStart },
    end: { line: relationLine, character: firstStart + 10 },
  });
});
