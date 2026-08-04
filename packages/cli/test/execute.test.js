import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { CliError, cliExitCodes } from '../src/errors.js';
import {
  createInvocationReport,
  executeDiagramWeaveCli,
} from '../src/execute.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml.jar';

function command(kind, overrides = {}) {
  return Object.freeze({
    kind,
    inputPath: 'workspace',
    outputPath: kind === 'render' ? 'artifacts' : null,
    javaPath,
    jarPath,
    format: 'svg',
    overwrite: false,
    json: false,
    help: false,
    ...overrides,
  });
}

function artifact(source, format = 'svg', bytes = Buffer.from('<svg/>')) {
  return Object.freeze({
    format,
    mediaType: format === 'svg' ? 'image/svg+xml' : 'image/png',
    encoding: 'base64',
    dataBase64: bytes.toString('base64'),
    byteLength: bytes.byteLength,
    sourceRevisionHash: `hash-${source}`,
  });
}

function discovery(inputs, inputKind = 'directory') {
  return Object.freeze({
    inputKind,
    rootPath: '/workspace',
    inputs: Object.freeze(inputs.map((input) => Object.freeze(input))),
  });
}

function input(relativePath, source = relativePath) {
  return {
    absolutePath: `/workspace/${relativePath}`,
    relativePath,
    sourceExtension: relativePath.endsWith('.plantuml') ? '.plantuml' : '.puml',
    source,
  };
}

function runtimeFor(inputs, overrides = {}) {
  const discovered = discovery(inputs, overrides.inputKind ?? 'directory');
  const writes = [];
  const renderCalls = [];
  return {
    writes,
    renderCalls,
    runtime: {
      fileSystem: {
        readFile: async (path) => {
          const record = inputs.find((candidate) => candidate.absolutePath === path);
          return Buffer.from(record.source);
        },
      },
      rendererFactory: () => Object.freeze({
        async render({ source, format }) {
          renderCalls.push({ source, format });
          return artifact(source, format);
        },
      }),
      discoverDiagramInputs: async () => discovered,
      planRenderOutputs: async () => Object.freeze({
        rootPath: '/artifacts',
        destinations: Object.freeze(inputs.map((record) => Object.freeze({
          input: record,
          absolutePath: `/artifacts/${record.relativePath.replace(/\.(?:puml|plantuml)$/u, '.svg')}`,
          outputPath: record.relativePath.replace(/\.(?:puml|plantuml)$/u, '.svg'),
        }))),
      }),
      publishArtifact: async (destination, bytes, overwrite) => {
        writes.push({ destination, bytes: Buffer.from(bytes), overwrite });
      },
      ...overrides.runtime,
    },
  };
}

function assertFrozenReport(report) {
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.totals), true);
  assert.equal(Object.isFrozen(report.files), true);
  for (const file of report.files) {
    assert.equal(Object.isFrozen(file), true);
  }
}

test('creates safe invocation reports and rejects unsafe exception metadata', () => {
  const safe = createInvocationReport('validate', new CliError('input_not_found', 'Missing input.'));
  assert.equal(safe.errorCode, 'input_not_found');
  assert.equal(safe.errorMessage, 'Missing input.');
  assert.equal(safe.exitCode, cliExitCodes.invocationFailure);
  assertFrozenReport(safe);

  const invalidFailures = [
    null,
    { code: 1, message: 'message' },
    { code: 'Invalid-Code', message: 'message' },
    { code: 'valid_code', message: 1 },
    { code: 'valid_code', message: '' },
    { code: 'valid_code', message: 'x'.repeat(513) },
    { code: 'valid_code', message: 'bad\u0000message' },
  ];
  for (const failure of invalidFailures) {
    const report = createInvocationReport(null, failure);
    assert.equal(report.errorCode, 'internal_cli_error');
    assert.equal(report.errorMessage, 'DiagramWeave CLI encountered an internal failure.');
  }
});

test('returns an immutable help report without a runtime', async () => {
  const report = await executeDiagramWeaveCli(
    Object.freeze({ kind: 'help', topic: 'validate' }),
    null,
  );
  assert.deepEqual(report, {
    schemaVersion: 1,
    command: 'help',
    status: 'success',
    exitCode: 0,
    format: null,
    inputKind: null,
    helpTopic: 'validate',
    errorCode: null,
    errorMessage: null,
    diagnostics: [],
    totals: { selected: 0, succeeded: 0, failed: 0 },
    files: [],
  });
  assertFrozenReport(report);
});

test('returns a safe failure when the runtime is unavailable', async () => {
  const report = await executeDiagramWeaveCli(command('validate'), null);
  assert.equal(report.status, 'invocation_failure');
  assert.equal(report.errorCode, 'internal_cli_error');
});

test('validates files sequentially, discards artifacts, and freezes nested results', async () => {
  const inputs = [input('a.puml', 'a'), input('nested/b.plantuml', 'b')];
  const setup = runtimeFor(inputs);
  const report = await executeDiagramWeaveCli(command('validate'), setup.runtime);
  assert.equal(report.status, 'success');
  assert.equal(report.exitCode, 0);
  assert.equal(report.inputKind, 'directory');
  assert.equal(report.format, 'svg');
  assert.deepEqual(setup.renderCalls, [
    { source: 'a', format: 'svg' },
    { source: 'b', format: 'svg' },
  ]);
  assert.deepEqual(setup.writes, []);
  assert.deepEqual(report.files.map((file) => ({
    relativePath: file.relativePath,
    status: file.status,
    outputPath: file.outputPath,
    sourceRevisionHash: file.sourceRevisionHash,
  })), [
    { relativePath: 'a.puml', status: 'valid', outputPath: null, sourceRevisionHash: 'hash-a' },
    { relativePath: 'nested/b.plantuml', status: 'valid', outputPath: null, sourceRevisionHash: 'hash-b' },
  ]);
  assert.deepEqual(report.totals, { selected: 2, succeeded: 2, failed: 0 });
  assertFrozenReport(report);
});

test('renders deterministic destinations and propagates PNG bytes and overwrite', async () => {
  const inputs = [input('a.puml', 'a')];
  const setup = runtimeFor(inputs, {
    runtime: {
      rendererFactory: () => Object.freeze({
        async render({ source, format }) {
          setup.renderCalls.push({ source, format });
          return artifact(source, format, Buffer.from('PNG'));
        },
      }),
    },
  });
  const report = await executeDiagramWeaveCli(command('render', {
    format: 'png',
    overwrite: true,
  }), setup.runtime);
  assert.equal(report.status, 'success');
  assert.equal(report.files[0].status, 'rendered');
  assert.equal(report.files[0].outputPath, 'a.svg');
  assert.equal(setup.writes.length, 1);
  assert.equal(setup.writes[0].bytes.toString(), 'PNG');
  assert.equal(setup.writes[0].overwrite, true);
});

test('aggregates renderer failures without stopping later diagrams', async () => {
  const inputs = [input('bad.puml', 'bad'), input('good.puml', 'good')];
  const setup = runtimeFor(inputs, {
    runtime: {
      rendererFactory: () => Object.freeze({
        async render({ source, format }) {
          if (source === 'bad') {
            throw new CliError('renderer_failed', 'PlantUML rejected the diagram.');
          }
          return artifact(source, format);
        },
      }),
    },
  });
  const report = await executeDiagramWeaveCli(command('validate'), setup.runtime);
  assert.equal(report.status, 'diagram_failure');
  assert.equal(report.exitCode, 1);
  assert.deepEqual(report.totals, { selected: 2, succeeded: 1, failed: 1 });
  assert.equal(report.files[0].errorCode, 'renderer_failed');
  assert.equal(report.files[1].status, 'valid');
});

test('maps unsafe renderer exceptions to a generic diagram failure', async () => {
  const inputs = [input('bad.puml', 'bad')];
  const setup = runtimeFor(inputs, {
    runtime: {
      rendererFactory: () => Object.freeze({
        async render() {
          throw { code: 'BAD-CODE', message: 'leaked\u0000source' };
        },
      }),
    },
  });
  const report = await executeDiagramWeaveCli(command('validate'), setup.runtime);
  assert.equal(report.exitCode, 1);
  assert.equal(report.files[0].errorCode, 'renderer_failed');
  assert.equal(report.files[0].errorMessage, 'The diagram could not be rendered.');
});

test('treats source read and UTF-8 failures as operational failures while continuing', async () => {
  const inputs = [input('missing.puml'), input('invalid.puml'), input('good.puml', 'good')];
  const setup = runtimeFor(inputs, {
    runtime: {
      fileSystem: {
        readFile: async (path) => {
          if (path.endsWith('missing.puml')) {
            throw new Error('private path');
          }
          if (path.endsWith('invalid.puml')) {
            return Buffer.from([0xff]);
          }
          return Buffer.from('good');
        },
      },
    },
  });
  const report = await executeDiagramWeaveCli(command('validate'), setup.runtime);
  assert.equal(report.status, 'invocation_failure');
  assert.equal(report.exitCode, 2);
  assert.deepEqual(report.totals, { selected: 3, succeeded: 1, failed: 2 });
  assert.equal(report.files[0].errorCode, 'input_read_failed');
  assert.equal(report.files[1].errorCode, 'input_read_failed');
  assert.equal(report.files[2].status, 'valid');
});

test('preserves safe source read errors and marks publication failures operational', async () => {
  const inputs = [input('read.puml'), input('write.puml', 'write')];
  const setup = runtimeFor(inputs, {
    runtime: {
      fileSystem: {
        readFile: async (path) => {
          if (path.endsWith('read.puml')) {
            throw new CliError('input_read_failed', 'The source is not readable.');
          }
          return Buffer.from('write');
        },
      },
      publishArtifact: async () => {
        throw new CliError('output_write_failed', 'The destination is read-only.');
      },
    },
  });
  const report = await executeDiagramWeaveCli(command('render'), setup.runtime);
  assert.equal(report.exitCode, 2);
  assert.equal(report.files[0].errorMessage, 'The source is not readable.');
  assert.equal(report.files[1].errorMessage, 'The destination is read-only.');
});

test('fails invocation before rendering when discovery, planning, or factory setup fails', async () => {
  const inputs = [input('a.puml', 'a')];
  const cases = [
    {
      kind: 'validate',
      runtime: { discoverDiagramInputs: async () => { throw new CliError('input_empty', 'No diagrams.'); } },
      code: 'input_empty',
    },
    {
      kind: 'render',
      runtime: { planRenderOutputs: async () => { throw new CliError('output_exists', 'Output exists.'); } },
      code: 'output_exists',
    },
    {
      kind: 'validate',
      runtime: { rendererFactory: () => { throw new CliError('renderer_unavailable', 'Renderer unavailable.'); } },
      code: 'renderer_unavailable',
    },
    {
      kind: 'validate',
      runtime: { rendererFactory: () => null },
      code: 'renderer_unavailable',
    },
  ];
  for (const item of cases) {
    const setup = runtimeFor(inputs, { runtime: item.runtime });
    const report = await executeDiagramWeaveCli(command(item.kind), setup.runtime);
    assert.equal(report.status, 'invocation_failure');
    assert.equal(report.errorCode, item.code);
    assert.equal(setup.renderCalls.length, 0);
    assert.equal(setup.writes.length, 0);
  }
});

test('rejects every malformed renderer artifact contract and length mismatch', async () => {
  const valid = artifact('x');
  const malformedArtifacts = [
    null,
    'artifact',
    { ...valid, format: 'png' },
    { ...valid, encoding: 'hex' },
    { ...valid, dataBase64: 1 },
    { ...valid, dataBase64: '*' },
    { ...valid, byteLength: '6' },
    { ...valid, sourceRevisionHash: 1 },
    { ...valid, sourceRevisionHash: '' },
    { ...valid, byteLength: valid.byteLength + 1 },
  ];
  for (const malformed of malformedArtifacts) {
    const inputs = [input('x.puml', 'x')];
    const setup = runtimeFor(inputs, {
      runtime: {
        rendererFactory: () => Object.freeze({ async render() { return malformed; } }),
      },
    });
    const report = await executeDiagramWeaveCli(command('validate'), setup.runtime);
    assert.equal(report.status, 'invocation_failure');
    assert.equal(report.files[0].errorCode, 'internal_cli_error');
  }
});

test('uses default discovery, planning, and publication functions with a real filesystem', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-execute-'));
  try {
    await mkdir(join(root, 'workspace'));
    await writeFile(join(root, 'workspace', 'a.puml'), 'a');
    const fileSystem = {
      cwd: () => root,
      lstat,
      readdir,
      readFile,
      mkdir,
      open,
      rename,
      unlink,
      randomId: () => 'execute',
    };
    const report = await executeDiagramWeaveCli(command('render', {
      inputPath: 'workspace',
      outputPath: 'artifacts',
    }), {
      fileSystem,
      rendererFactory: () => Object.freeze({
        async render({ source, format }) {
          return artifact(source, format);
        },
      }),
    });
    assert.equal(report.status, 'success');
    assert.equal(await readFile(join(root, 'artifacts', 'a.svg'), 'utf8'), '<svg/>');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports a safe render destination when one rendered diagram fails', async () => {
  const inputs = [input('bad.puml', 'bad')];
  const setup = runtimeFor(inputs, {
    runtime: {
      rendererFactory: () => Object.freeze({
        async render() {
          throw new CliError('renderer_failed', 'PlantUML rejected the diagram.');
        },
      }),
    },
  });
  const report = await executeDiagramWeaveCli(command('render'), setup.runtime);
  assert.equal(report.status, 'diagram_failure');
  assert.equal(report.files[0].outputPath, 'bad.svg');
});
