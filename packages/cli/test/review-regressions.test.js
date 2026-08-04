import assert from 'node:assert/strict';
import test from 'node:test';

import { CliError } from '../src/errors.js';
import { executeDiagramWeaveCli } from '../src/execute.js';

const sourceRevisionHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const input = Object.freeze({
  absolutePath: '/workspace/diagram.puml',
  relativePath: 'diagram.puml',
  sourceExtension: '.puml',
});
const discovery = Object.freeze({
  inputKind: 'file',
  rootPath: '/workspace/diagram.puml',
  inputs: Object.freeze([input]),
});
const destination = Object.freeze({
  input,
  absolutePath: '/workspace/diagram.svg',
  outputPath: 'diagram.svg',
});

function command(kind) {
  return Object.freeze({
    kind,
    inputPath: 'diagram.puml',
    outputPath: kind === 'render' ? 'diagram.svg' : null,
    javaPath: '/opt/java/bin/java',
    jarPath: '/opt/plantuml/plantuml.jar',
    format: 'svg',
    overwrite: false,
    json: true,
    help: false,
  });
}

function artifact() {
  const bytes = Buffer.from('<svg/>');
  return Object.freeze({
    format: 'svg',
    mediaType: 'image/svg+xml',
    encoding: 'base64',
    dataBase64: bytes.toString('base64'),
    byteLength: bytes.byteLength,
    sourceRevisionHash,
  });
}

function runtime(overrides = {}) {
  return {
    fileSystem: {
      readFile: async () => Buffer.from('@startuml\n@enduml\n'),
    },
    discoverDiagramInputs: async () => discovery,
    planRenderOutputs: async () => Object.freeze({
      rootPath: destination.absolutePath,
      destinations: Object.freeze([destination]),
    }),
    rendererFactory: () => Object.freeze({
      render: async () => artifact(),
    }),
    publishArtifact: async () => undefined,
    ...overrides,
  };
}

test('copies the renderer revision hash without recomputing it', async () => {
  const report = await executeDiagramWeaveCli(command('validate'), runtime());

  assert.equal(report.status, 'success');
  assert.equal(report.files[0].sourceRevisionHash, sourceRevisionHash);
});

test('rejects invalid UTF-8 before invoking the renderer and reports a null hash', async () => {
  let renderCalls = 0;
  const report = await executeDiagramWeaveCli(command('validate'), runtime({
    fileSystem: {
      readFile: async () => Buffer.from([0xff]),
    },
    rendererFactory: () => Object.freeze({
      async render() {
        renderCalls += 1;
        return artifact();
      },
    }),
  }));

  assert.equal(renderCalls, 0);
  assert.deepEqual(report, {
    schemaVersion: 1,
    command: 'validate',
    status: 'invocation_failure',
    exitCode: 2,
    format: 'svg',
    inputKind: 'file',
    helpTopic: null,
    errorCode: null,
    errorMessage: null,
    diagnostics: [],
    totals: { selected: 1, succeeded: 0, failed: 1 },
    files: [{
      relativePath: 'diagram.puml',
      status: 'failed',
      sourceRevisionHash: null,
      outputPath: null,
      errorCode: 'input_read_failed',
      errorMessage: 'The diagram source could not be read as UTF-8.',
      diagnostics: [],
    }],
  });
});

test('preserves a trusted renderer hash when atomic publication fails', async () => {
  const report = await executeDiagramWeaveCli(command('render'), runtime({
    publishArtifact: async () => {
      throw new CliError('output_write_failed', 'The destination is read-only.');
    },
  }));

  assert.deepEqual(report, {
    schemaVersion: 1,
    command: 'render',
    status: 'invocation_failure',
    exitCode: 2,
    format: 'svg',
    inputKind: 'file',
    helpTopic: null,
    errorCode: null,
    errorMessage: null,
    diagnostics: [],
    totals: { selected: 1, succeeded: 0, failed: 1 },
    files: [{
      relativePath: 'diagram.puml',
      status: 'failed',
      sourceRevisionHash,
      outputPath: 'diagram.svg',
      errorCode: 'output_write_failed',
      errorMessage: 'The destination is read-only.',
      diagnostics: [],
    }],
  });
});

test('maps renderer construction failure to one source-free invocation fixture', async () => {
  const report = await executeDiagramWeaveCli(command('validate'), runtime({
    rendererFactory: () => {
      throw new CliError('renderer_unavailable', 'Renderer unavailable.');
    },
  }));

  assert.deepEqual(report, {
    schemaVersion: 1,
    command: 'validate',
    status: 'invocation_failure',
    exitCode: 2,
    format: null,
    inputKind: null,
    helpTopic: null,
    errorCode: 'renderer_unavailable',
    errorMessage: 'Renderer unavailable.',
    diagnostics: [],
    totals: { selected: 0, succeeded: 0, failed: 0 },
    files: [],
  });
});
