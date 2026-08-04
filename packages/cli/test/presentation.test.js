import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCliReport } from '../src/presentation.js';

function report(overrides = {}) {
  return {
    schemaVersion: 1,
    command: 'validate',
    status: 'success',
    exitCode: 0,
    format: 'svg',
    inputKind: 'file',
    helpTopic: null,
    errorCode: null,
    errorMessage: null,
    totals: { selected: 1, succeeded: 1, failed: 0 },
    files: [{
      relativePath: 'diagram.puml',
      status: 'valid',
      sourceRevisionHash: 'hash',
      outputPath: null,
      errorCode: null,
      errorMessage: null,
    }],
    ...overrides,
  };
}

test('serializes canonical newline-terminated JSON without hidden payload fields', () => {
  const value = report();
  const serialized = formatCliReport(value, true);
  assert.equal(serialized, `${JSON.stringify(value)}\n`);
  for (const forbidden of ['dataBase64', 'javaPath', 'jarPath', 'stderr', '@startuml']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('formats global and command-specific help', () => {
  const globalHelp = formatCliReport(report({ command: 'help', helpTopic: null }), false);
  assert.match(globalHelp, /^DiagramWeave CLI/m);
  assert.match(globalHelp, /dweave validate/);
  assert.match(globalHelp, /dweave render/);

  const validateHelp = formatCliReport(report({ command: 'help', helpTopic: 'validate' }), false);
  assert.match(validateHelp, /^Usage: dweave validate/m);
  assert.match(validateHelp, /sandboxed local renderer/);

  const renderHelp = formatCliReport(report({ command: 'help', helpTopic: 'render' }), false);
  assert.match(renderHelp, /^Usage: dweave render/m);
  assert.match(renderHelp, /--overwrite/);
});

test('formats validation, rendering, and failure file lines with safe summaries', () => {
  const rendered = formatCliReport(report({
    command: 'render',
    files: [
      { relativePath: 'a.puml', status: 'valid', sourceRevisionHash: 'h1', outputPath: null, errorCode: null, errorMessage: null },
      { relativePath: 'b.puml', status: 'rendered', sourceRevisionHash: 'h2', outputPath: 'b.svg', errorCode: null, errorMessage: null },
      { relativePath: 'c.puml', status: 'failed', sourceRevisionHash: null, outputPath: null, errorCode: 'renderer_failed', errorMessage: 'Diagram failed.' },
      { relativePath: 'd.puml', status: 'failed', sourceRevisionHash: null, outputPath: 'd.svg', errorCode: 'output_exists', errorMessage: 'Output exists.' },
    ],
    totals: { selected: 4, succeeded: 2, failed: 2 },
  }), false);
  assert.equal(rendered, [
    'VALID a.puml',
    'RENDERED b.puml -> b.svg',
    'FAIL c.puml [renderer_failed] Diagram failed.',
    'FAIL d.puml -> d.svg [output_exists] Output exists.',
    'Summary: 2/4 succeeded; 2 failed.',
    '',
  ].join('\n'));
});

test('formats top-level invocation failures and omits a summary without an input kind', () => {
  const output = formatCliReport(report({
    status: 'invocation_failure',
    exitCode: 2,
    inputKind: null,
    errorCode: 'invalid_cli_arguments',
    errorMessage: 'A command is required.',
    totals: { selected: 0, succeeded: 0, failed: 0 },
    files: [],
  }), false);
  assert.equal(output, 'ERROR [invalid_cli_arguments] A command is required.\n');
});
