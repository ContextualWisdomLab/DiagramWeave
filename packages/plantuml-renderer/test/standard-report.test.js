import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePlantUmlStandardReport } from '../src/standard-report.js';

const officialError = [
  'protocolVersion=1',
  'status=ERROR',
  'lineNumber=2',
  'label=Syntax Error?',
  'Error line 2 in file: file1.pu',
  'Some diagram description contains errors',
].join('\n');

function assertDeeplyFrozen(report) {
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.diagnostics), true);
  for (const diagnostic of report.diagnostics) {
    assert.equal(Object.isFrozen(diagnostic), true);
    assert.equal(Object.isFrozen(diagnostic.range), true);
    assert.equal(Object.isFrozen(diagnostic.range.start), true);
    assert.equal(Object.isFrozen(diagnostic.range.end), true);
    assert.equal(Object.isFrozen(diagnostic.data), true);
  }
}

test('parses the official PlantUML stdrpt:1 syntax-error example', () => {
  const report = parsePlantUmlStandardReport(Buffer.from(officialError));
  assert.deepEqual(report, {
    protocolVersion: 1,
    status: 'error',
    diagnostics: [{
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 0 },
      },
      severity: 1,
      code: 'plantuml.syntax',
      source: 'plantuml',
      message: 'PlantUML reported a syntax error.',
      data: { plantUmlLineNumber: 2 },
    }],
  });
  assertDeeplyFrozen(report);
  assert.doesNotMatch(JSON.stringify(report), /Syntax Error|Famous Bob|file1\.pu/u);
});

test('accepts CRLF reports, ignores unknown and unstructured lines, and never exposes labels', () => {
  const report = parsePlantUmlStandardReport(Buffer.from([
    'protocolVersion=1',
    'vendorField=value',
    'status=ERROR',
    'lineNumber=7',
    'label=Alice = Bob: private source',
    'unstructured private source',
  ].join('\r\n')));
  assert.equal(report.status, 'error');
  assert.equal(report.diagnostics[0].range.start.line, 6);
  assert.equal(report.diagnostics[0].data.plantUmlLineNumber, 7);
  assert.doesNotMatch(JSON.stringify(report), /Alice|Bob|private/u);
});

test('returns success, unknown, and an error without a fabricated location', () => {
  const successful = parsePlantUmlStandardReport(Buffer.from(
    'protocolVersion=1\nstatus=OK\nlabel=previous status=ERROR text\n',
  ));
  assert.deepEqual(successful, {
    protocolVersion: 1,
    status: 'ok',
    diagnostics: [],
  });
  assertDeeplyFrozen(successful);

  const unknown = parsePlantUmlStandardReport(new Uint8Array(Buffer.from('older diagnostics')));
  assert.deepEqual(unknown, {
    protocolVersion: null,
    status: 'unknown',
    diagnostics: [],
  });

  const locationless = parsePlantUmlStandardReport(Buffer.from(
    'protocolVersion=1\nstatus=ERROR\nlabel=Syntax Error?\n',
  ));
  assert.deepEqual(locationless, {
    protocolVersion: 1,
    status: 'error',
    diagnostics: [],
  });
});

test('lets ERROR win over OK while rejecting duplicate scalar fields', () => {
  const mixed = parsePlantUmlStandardReport(Buffer.from(
    'protocolVersion=1\nstatus=OK\nstatus=ERROR\nlineNumber=3\n',
  ));
  assert.equal(mixed.status, 'error');
  assert.equal(mixed.diagnostics[0].range.start.line, 2);

  for (const text of [
    'protocolVersion=1\nprotocolVersion=1\nstatus=OK',
    'status=ERROR\nlineNumber=2\nlineNumber=2',
  ]) {
    assert.deepEqual(parsePlantUmlStandardReport(Buffer.from(text)), {
      protocolVersion: null,
      status: 'invalid',
      diagnostics: [],
    });
  }
});

test('fails closed for unsupported or malformed known fields and invalid UTF-8', () => {
  const invalidReports = [
    'protocolVersion=2\nstatus=ERROR',
    'protocolVersion=x\nstatus=ERROR',
    'status=WARNING',
    'status=ERROR\nlineNumber=',
    'status=ERROR\nlineNumber=0',
    'status=ERROR\nlineNumber=-1',
    'status=ERROR\nlineNumber=1.5',
    'status=ERROR\nlineNumber=2147483648',
  ];
  for (const report of invalidReports) {
    assert.deepEqual(parsePlantUmlStandardReport(Buffer.from(report)), {
      protocolVersion: null,
      status: 'invalid',
      diagnostics: [],
    }, report);
  }
  assert.deepEqual(parsePlantUmlStandardReport(Buffer.from([0xff])), {
    protocolVersion: null,
    status: 'invalid',
    diagnostics: [],
  });
  assert.deepEqual(parsePlantUmlStandardReport('status=OK'), {
    protocolVersion: null,
    status: 'invalid',
    diagnostics: [],
  });
});
