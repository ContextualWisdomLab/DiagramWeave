import assert from 'node:assert/strict';
import test from 'node:test';

import * as rendererApi from '../src/index.js';

const officialErrorReport = Buffer.from([
  'protocolVersion=1',
  'status=ERROR',
  'lineNumber=2',
  'label=Syntax Error?',
  'Error line 2 in file: file1.pu',
  'Some diagram description contains errors',
  '',
].join('\n'));

function parser() {
  assert.equal(
    typeof rendererApi.parsePlantUmlStandardReport,
    'function',
    'parsePlantUmlStandardReport must be exported',
  );
  return rendererApi.parsePlantUmlStandardReport;
}

test('parses the official verbose syntax-error report into one safe diagnostic', () => {
  const result = parser()(officialErrorReport);
  assert.deepEqual(result, {
    protocolVersion: 1,
    status: 'error',
    diagnostic: {
      schemaVersion: 1,
      source: 'plantuml',
      severity: 'error',
      code: 'plantuml_syntax_error',
      message: 'PlantUML reported a syntax error.',
      lineNumber: 2,
      columnNumber: null,
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.diagnostic), true);
});

test('parses CRLF success reports and ignores narrative decoys', () => {
  const result = parser()(Buffer.from(
    'protocolVersion=1\r\nstatus=OK\r\n' +
    'label=previous status=ERROR text\r\n' +
    'narrative status=ERROR should not match\r\n',
  ));
  assert.deepEqual(result, {
    protocolVersion: 1,
    status: 'ok',
    diagnostic: null,
  });
});

test('returns unknown for empty and status-free reports', () => {
  for (const report of [Buffer.alloc(0), Buffer.from('unstructured narrative\n')]) {
    assert.deepEqual(parser()(report), {
      protocolVersion: null,
      status: 'unknown',
      diagnostic: null,
    });
  }
});

test('maps exact syntax labels and hides every unknown label', () => {
  for (const label of ['Syntax Error', 'Syntax Error?']) {
    assert.equal(
      parser()(Buffer.from(`status=ERROR\nlabel=${label}\n`)).diagnostic.code,
      'plantuml_syntax_error',
    );
  }

  const secretLabel = 'CustomerSecretElement leaked';
  const result = parser()(Buffer.from(`status=ERROR\nlabel=${secretLabel}\n`));
  assert.deepEqual(result.diagnostic, {
    schemaVersion: 1,
    source: 'plantuml',
    severity: 'error',
    code: 'plantuml_error',
    message: 'PlantUML reported a diagram error.',
    lineNumber: null,
    columnNumber: null,
  });
  assert.doesNotMatch(JSON.stringify(result), /CustomerSecretElement|leaked/);
});

test('accepts missing and bounded line numbers', () => {
  assert.equal(
    parser()(Buffer.from('status=ERROR\n')).diagnostic.lineNumber,
    null,
  );
  for (const lineNumber of [1, 2147483647]) {
    assert.equal(
      parser()(Buffer.from(`status=ERROR\nlineNumber=${lineNumber}\n`)).diagnostic.lineNumber,
      lineNumber,
    );
  }
});

test('fails closed for malformed recognized fields', () => {
  const malformedReports = [
    'status=FAIL\n',
    'protocolVersion=0\nstatus=ERROR\n',
    'protocolVersion=2\nstatus=ERROR\n',
    'protocolVersion=one\nstatus=ERROR\n',
    'status=ERROR\nlineNumber=0\n',
    'status=ERROR\nlineNumber=-1\n',
    'status=ERROR\nlineNumber=1.5\n',
    'status=ERROR\nlineNumber=01\n',
    'status=ERROR\nlineNumber=2147483648\n',
    'status=ERROR\nlineNumber=2x\n',
    'status=ERROR\nstatus=OK\n',
    'status=ERROR\nlineNumber=2\nlineNumber=3\n',
    'status=ERROR\nlabel=a\nlabel=b\n',
    'protocolVersion=1\nprotocolVersion=1\nstatus=ERROR\n',
  ];
  for (const report of malformedReports) {
    assert.deepEqual(
      parser()(Buffer.from(report)),
      { protocolVersion: null, status: 'invalid', diagnostic: null },
      report,
    );
  }
});

test('fails closed when standard-report bytes are not valid UTF-8', () => {
  assert.deepEqual(
    parser()(Buffer.from([0xff, 0xfe, 0xfd])),
    { protocolVersion: null, status: 'invalid', diagnostic: null },
  );
});

test('rejects non-buffer parser input without exposing its value', () => {
  for (const input of [null, 'status=ERROR', new Uint8Array([1])]) {
    assert.throws(
      () => parser()(input),
      (error) => {
        assert.equal(error instanceof TypeError, true);
        assert.equal(error.message, 'diagnostics must be a Buffer.');
        return true;
      },
    );
  }
});
