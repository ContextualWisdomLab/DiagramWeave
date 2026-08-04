import assert from 'node:assert/strict';
import test from 'node:test';

import { CliError } from '../src/errors.js';
import { executeDiagramWeaveCli } from '../src/execute.js';
import { formatCliReport } from '../src/presentation.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java';
const jarPath = process.platform === 'win32'
  ? 'C:\\PlantUML\\plantuml.jar'
  : '/opt/plantuml.jar';

function command() {
  return Object.freeze({
    kind: 'validate',
    inputPath: 'workspace',
    outputPath: null,
    javaPath,
    jarPath,
    format: 'svg',
    overwrite: false,
    json: false,
    help: false,
  });
}

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

function runtimeFor(error) {
  const input = Object.freeze({
    absolutePath: '/workspace/flows/checkout.puml',
    relativePath: 'flows/checkout.puml',
    sourceExtension: '.puml',
  });
  return {
    fileSystem: {
      readFile: async () => Buffer.from('@startuml\nAlice -> Bob\n@enduml\n'),
    },
    discoverDiagramInputs: async () => Object.freeze({
      inputKind: 'file',
      rootPath: '/workspace/flows',
      inputs: Object.freeze([input]),
    }),
    rendererFactory: () => Object.freeze({
      async render() {
        throw error;
      },
    }),
  };
}

test('copies safe renderer diagnostics into a deeply frozen file report', async () => {
  const original = diagnostic(1);
  const error = new CliError(
    'renderer_failed',
    'PlantUML rejected the source or failed to render it.',
  );
  error.diagnostics = [original];

  const report = await executeDiagramWeaveCli(command(), runtimeFor(error));
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.files[0].diagnostics, [original]);
  assert.equal(Object.isFrozen(report.diagnostics), true);
  assert.equal(Object.isFrozen(report.files[0].diagnostics), true);
  assert.equal(Object.isFrozen(report.files[0].diagnostics[0]), true);
  assert.equal(Object.isFrozen(report.files[0].diagnostics[0].range), true);
  assert.equal(Object.isFrozen(report.files[0].diagnostics[0].data), true);

  original.range.start.line = 99;
  assert.equal(report.files[0].diagnostics[0].range.start.line, 1);
});

test('non-renderer and hostile renderer failures expose no diagnostics', async () => {
  const safe = await executeDiagramWeaveCli(
    command(),
    runtimeFor(new CliError('renderer_failed', 'The diagram could not be rendered.')),
  );
  assert.deepEqual(safe.files[0].diagnostics, []);

  const hostile = new CliError('renderer_failed', 'The diagram could not be rendered.');
  Object.defineProperty(hostile, 'diagnostics', {
    get() {
      throw new Error('Alice -> Bob');
    },
  });
  const hostileReport = await executeDiagramWeaveCli(command(), runtimeFor(hostile));
  assert.deepEqual(hostileReport.files[0].diagnostics, []);
  assert.doesNotMatch(JSON.stringify(hostileReport), /Alice|Bob/);
});

test('prints deterministic line-addressable diagnostics after the file failure', async () => {
  const error = new CliError(
    'renderer_failed',
    'PlantUML rejected the source or failed to render it.',
  );
  error.diagnostics = [diagnostic(1)];
  const report = await executeDiagramWeaveCli(command(), runtimeFor(error));

  assert.equal(
    formatCliReport(report, false),
    [
      'FAIL flows/checkout.puml [renderer_failed] PlantUML rejected the source or failed to render it.',
      '  flows/checkout.puml:2 ERROR [plantuml.syntax] PlantUML reported a syntax error.',
      'Summary: 0/1 succeeded; 1 failed.',
      '',
    ].join('\n'),
  );
  assert.equal(formatCliReport(report, true), `${JSON.stringify(report)}\n`);
});
