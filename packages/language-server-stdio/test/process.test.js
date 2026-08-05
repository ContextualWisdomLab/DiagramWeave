import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { encodeJsonRpcFrame } from '../src/json-rpc.js';
import {
  runLanguageServerStdioProcess,
  writeStdioBytes,
} from '../src/process.js';
import { LanguageServerStdioError } from '../src/errors.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';

class FakeInput extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pauseCalls = 0;
    this.resumeCalls = 0;
    this.options = options;
  }

  pause() {
    this.pauseCalls += 1;
    if (this.options.pauseThrows) throw new Error('pause secret');
  }

  resume() {
    this.resumeCalls += 1;
    if (this.options.resumeThrows) throw new Error('resume secret');
  }
}

function outputCollector(options = {}) {
  const frames = [];
  return {
    frames,
    write(bytes, callback) {
      if (options.throwSync) throw new Error('write secret');
      frames.push(Buffer.from(bytes));
      if (options.doubleCallback) {
        callback();
        callback(new Error('late secret'));
        return true;
      }
      callback(options.callbackError ? new Error('write secret') : undefined);
      return options.backpressure ? false : true;
    },
  };
}

function stderrCollector(options = {}) {
  let value = '';
  return {
    get value() { return value; },
    write(chunk) {
      if (options.throwSync) throw new Error('stderr secret');
      value += String(chunk);
      return true;
    },
  };
}

function sessionFactory() {
  return {
    async request(method) {
      return method === 'shutdown' ? null : { capabilities: {} };
    },
    async notify() {},
    dispose() {},
  };
}

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

function environment() {
  return {
    DIAGRAMWEAVE_JAVA_PATH: javaPath,
    DIAGRAMWEAVE_PLANTUML_JAR_PATH: jarPath,
  };
}

test('writeStdioBytes resolves one callback and normalizes stream failures', async () => {
  const success = outputCollector({ doubleCallback: true, backpressure: true });
  await writeStdioBytes(success, Buffer.from('x'));
  assert.equal(success.frames[0].toString(), 'x');

  await assert.rejects(
    writeStdioBytes(outputCollector({ callbackError: true }), Buffer.from('x')),
    (error) => error instanceof LanguageServerStdioError && error.code === 'output_failed',
  );
  await assert.rejects(
    writeStdioBytes(outputCollector({ throwSync: true }), Buffer.from('x')),
    (error) => error instanceof LanguageServerStdioError && error.code === 'output_failed',
  );
});

test('accepts a null-prototype process options record', async () => {
  const input = new EventEmitter();
  const options = Object.create(null);
  options.input = input;
  options.output = outputCollector();
  options.stderr = stderrCollector();
  options.environment = environment();
  options.setExitCode = () => undefined;
  options.sessionFactory = sessionFactory;
  const running = runLanguageServerStdioProcess(options);
  input.emit('data', encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }));
  assert.equal(await running, 1);
});

test('runs initialize, shutdown, and exit over stdio without calling process.exit', async () => {
  const input = new FakeInput();
  const output = outputCollector();
  const stderr = stderrCollector();
  const exitCodes = [];
  const running = runLanguageServerStdioProcess({
    input,
    output,
    stderr,
    environment: environment(),
    setExitCode(code) { exitCodes.push(code); },
    sessionFactory,
  });
  input.emit('data', Buffer.concat([
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 2, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));
  assert.equal(await running, 0);
  assert.deepEqual(exitCodes, [0]);
  assert.equal(stderr.value, '');
  assert.deepEqual(output.frames.map(decodeFrame).map(({ id }) => id), [1, 2]);
  assert.equal(input.pauseCalls, 1);
  assert.equal(input.listenerCount('data'), 0);
});

test('treats clean EOF and input stream failures as abnormal termination', async () => {
  for (const event of ['end', 'error']) {
    const input = new FakeInput();
    const exitCodes = [];
    const running = runLanguageServerStdioProcess({
      input,
      output: outputCollector(),
      stderr: stderrCollector(),
      environment: environment(),
      setExitCode(code) { exitCodes.push(code); },
      sessionFactory,
    });
    input.emit(event, event === 'error' ? new Error('input secret') : undefined);
    assert.equal(await running, 1);
    assert.deepEqual(exitCodes, [1]);
  }
});

test('returns one fixed configuration failure for invalid streams, environment, and session setup', async () => {
  assert.equal(await runLanguageServerStdioProcess(null), 1);
  assert.equal(await runLanguageServerStdioProcess([]), 1);
  const revokedOptions = Proxy.revocable({}, {});
  revokedOptions.revoke();
  assert.equal(await runLanguageServerStdioProcess(revokedOptions.proxy), 1);

  const invalidStderr = stderrCollector();
  const invalidCodes = [];
  assert.equal(await runLanguageServerStdioProcess({
    input: {},
    output: {},
    stderr: invalidStderr,
    environment: {},
    setExitCode(code) { invalidCodes.push(code); },
  }), 1);
  assert.equal(invalidStderr.value, '');
  assert.deepEqual(invalidCodes, []);

  const hostileEnvironment = new Proxy({}, {
    getPrototypeOf() { return Object.prototype; },
    get() { throw new Error('environment secret'); },
  });
  const environmentStderr = stderrCollector();
  assert.equal(await runLanguageServerStdioProcess({
    input: new FakeInput(),
    output: outputCollector(),
    stderr: environmentStderr,
    environment: hostileEnvironment,
    setExitCode() {},
    sessionFactory,
  }), 1);
  assert.equal(environmentStderr.value, 'DiagramWeave Language Server configuration failed.\n');
  assert.equal(await runLanguageServerStdioProcess({
    input: new FakeInput(),
    output: outputCollector(),
    stderr: stderrCollector({ throwSync: true }),
    environment: hostileEnvironment,
    setExitCode() { throw new Error('exit secret'); },
    sessionFactory,
  }), 1);

  const sessionStderr = stderrCollector();
  assert.equal(await runLanguageServerStdioProcess({
    input: new FakeInput(),
    output: outputCollector(),
    stderr: sessionStderr,
    environment: environment(),
    setExitCode() {},
    sessionFactory() { throw new Error('session secret'); },
  }), 1);
  assert.equal(sessionStderr.value, 'DiagramWeave Language Server configuration failed.\n');
  assert.equal(await runLanguageServerStdioProcess({
    input: new FakeInput(),
    output: outputCollector(),
    stderr: stderrCollector({ throwSync: true }),
    environment: environment(),
    setExitCode() {},
    sessionFactory() { throw new Error('session secret'); },
  }), 1);
});

test('suppresses stderr and exit-setter failures during configuration reporting', async () => {
  assert.equal(await runLanguageServerStdioProcess({
    input: {},
    output: {},
    stderr: stderrCollector({ throwSync: true }),
    environment: {},
    setExitCode() { throw new Error('exit secret'); },
  }), 1);

  const options = new Proxy({}, {
    getPrototypeOf() { return Object.prototype; },
    get() { throw new Error('options secret'); },
  });
  assert.equal(await runLanguageServerStdioProcess(options), 1);
});

test('aborts when pause, initial resume, or later resume fails', async () => {
  for (const mode of ['pause', 'initial-resume', 'later-resume']) {
    const input = new FakeInput({ resumeThrows: mode === 'initial-resume' });
    const running = runLanguageServerStdioProcess({
      input,
      output: outputCollector(),
      stderr: stderrCollector(),
      environment: environment(),
      setExitCode() {},
      sessionFactory,
    });
    if (mode === 'pause') {
      input.options.pauseThrows = true;
      input.emit('data', encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }));
    } else if (mode === 'later-resume') {
      input.emit('data', encodeJsonRpcFrame({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
      input.options.resumeThrows = true;
    }
    assert.equal(await running, 1);
  }
});

test('normalizes output callback failure and ignores exit-code setter errors', async () => {
  const input = new FakeInput();
  const running = runLanguageServerStdioProcess({
    input,
    output: outputCollector({ callbackError: true }),
    stderr: stderrCollector(),
    environment: environment(),
    setExitCode() { throw new Error('exit secret'); },
    sessionFactory,
  });
  input.emit('data', encodeJsonRpcFrame({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
  assert.equal(await running, 1);
});

test('normalizes a truncated stdio stream through the end handler', async () => {
  const input = new FakeInput();
  const output = outputCollector();
  const running = runLanguageServerStdioProcess({
    input,
    output,
    stderr: stderrCollector(),
    environment: environment(),
    setExitCode() {},
    sessionFactory,
  });
  input.emit('data', Buffer.from('Content-Length: 2\r\n\r\nx', 'ascii'));
  await new Promise((resolve) => setImmediate(resolve));
  input.emit('end');
  assert.equal(await running, 1);
  assert.equal(decodeFrame(output.frames[0]).error.code, -32700);
});

test('accepts omitted pause and resume methods on a valid event source', async () => {
  const input = new EventEmitter();
  const running = runLanguageServerStdioProcess({
    input,
    output: outputCollector(),
    stderr: stderrCollector(),
    environment: environment(),
    setExitCode() {},
    sessionFactory,
  });
  input.emit('data', encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }));
  assert.equal(await running, 1);
});
