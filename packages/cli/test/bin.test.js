import assert from 'node:assert/strict';
import test from 'node:test';

const originalArgv = process.argv;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;
const originalExitCode = process.exitCode;
let topLevelStdout = '';
let topLevelStderr = '';
let binModule;
try {
  process.argv = [process.execPath, 'bin.js', '--help'];
  process.stdout.write = (value) => {
    topLevelStdout += String(value);
    return true;
  };
  process.stderr.write = (value) => {
    topLevelStderr += String(value);
    return true;
  };
  binModule = await import('../src/bin.js?bin-test');
} finally {
  process.argv = originalArgv;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  process.exitCode = originalExitCode;
}

const { runCliProcess, writeProcessStderr } = binModule;

function io() {
  const state = { stdout: '', stderr: '', exitCode: null };
  return {
    state,
    adapter: {
      stdout(value) {
        state.stdout += value;
      },
      stderr(value) {
        state.stderr += value;
      },
      setExitCode(value) {
        state.exitCode = value;
      },
    },
  };
}

function report(exitCode, overrides = {}) {
  return Object.freeze({
    schemaVersion: 1,
    command: 'validate',
    status: exitCode === 0 ? 'success' : exitCode === 1 ? 'diagram_failure' : 'invocation_failure',
    exitCode,
    format: 'svg',
    inputKind: exitCode === 2 ? null : 'file',
    helpTopic: null,
    errorCode: exitCode === 2 ? 'invalid_cli_arguments' : null,
    errorMessage: exitCode === 2 ? 'Invalid arguments.' : null,
    totals: Object.freeze({ selected: 0, succeeded: 0, failed: 0 }),
    files: Object.freeze([]),
    ...overrides,
  });
}

test('executes the top-level help boundary through stdout', () => {
  assert.match(topLevelStdout, /^DiagramWeave CLI/m);
  assert.equal(topLevelStderr, '');
});

test('exposes the real process stderr boundary without changing report routing', () => {
  let captured = '';
  const original = process.stderr.write;
  try {
    process.stderr.write = (value) => {
      captured += String(value);
      return true;
    };
    assert.equal(writeProcessStderr('diagnostic\n'), true);
  } finally {
    process.stderr.write = original;
  }
  assert.equal(captured, 'diagnostic\n');
});

test('writes successful and diagram-failure reports to stdout', async () => {
  for (const exitCode of [0, 1]) {
    const streams = io();
    const expected = report(exitCode);
    const actual = await runCliProcess(
      ['validate', 'a.puml'],
      {},
      streams.adapter,
      { runCli: async () => expected },
    );
    assert.equal(actual, expected);
    assert.equal(streams.state.stderr, '');
    assert.equal(streams.state.exitCode, exitCode);
    assert.match(streams.state.stdout, /\n$/u);
  }
});

test('writes human invocation failures to stderr and JSON failures to stdout', async () => {
  const human = io();
  await runCliProcess(
    'not-an-array',
    {},
    human.adapter,
    { runCli: async () => report(2) },
  );
  assert.equal(human.state.stdout, '');
  assert.equal(human.state.stderr, 'ERROR [invalid_cli_arguments] Invalid arguments.\n');
  assert.equal(human.state.exitCode, 2);

  const json = io();
  await runCliProcess(
    ['validate', 'a.puml', '--json'],
    {},
    json.adapter,
    { runCli: async () => report(2) },
  );
  assert.equal(json.state.stderr, '');
  assert.doesNotThrow(() => JSON.parse(json.state.stdout));
  assert.equal(json.state.exitCode, 2);
});

test('converts unexpected process-boundary failures into source-free internal errors', async () => {
  const streams = io();
  const actual = await runCliProcess(
    [],
    {},
    streams.adapter,
    { runCli: async () => { throw new Error('leaked source'); } },
  );
  assert.equal(actual.errorCode, 'internal_cli_error');
  assert.equal(streams.state.stderr.includes('leaked source'), false);
  assert.equal(streams.state.exitCode, 2);
});
