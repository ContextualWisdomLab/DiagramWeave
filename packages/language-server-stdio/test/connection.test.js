import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '@contextualwisdomlab/diagramweave-language-server';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { LanguageServerStdioError } from '../src/errors.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';
import { languageServerStdioLimits } from '../src/limits.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

function clientFrame(message) {
  return encodeJsonRpcFrame(message);
}

function rawClientFrame(text) {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`, 'ascii'),
    bytes,
  ]);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const output = [];
  const exits = [];
  const calls = [];
  let disposed = 0;
  let publishNotification;
  const session = overrides.session ?? {
    async request(method, params) {
      calls.push({ kind: 'request', method, params });
      return { method };
    },
    async notify(method, params) {
      calls.push({ kind: 'notification', method, params });
      if (method === 'emit') {
        await publishNotification('window/logMessage', { type: 3, message: 'safe' });
      }
    },
    dispose() {
      disposed += 1;
    },
  };
  const options = {
    javaPath,
    jarPath,
    rendererFactory: overrides.rendererFactory,
    sessionFactory(sessionOptions) {
      assert.equal(sessionOptions.javaPath, javaPath);
      assert.equal(sessionOptions.jarPath, jarPath);
      publishNotification = sessionOptions.publishNotification;
      return session;
    },
    async writeBytes(bytes) {
      output.push(Buffer.from(bytes));
    },
    onExit(code) {
      exits.push(code);
    },
    ...overrides.options,
  };
  const connection = createLanguageServerStdioConnection(options);
  return { connection, output, exits, calls, getDisposed: () => disposed, getPublish: () => publishNotification };
}

function assertTransport(error, code) {
  assert.equal(error instanceof LanguageServerStdioError, true);
  assert.equal(error.code, code);
  return true;
}

test('dispatches requests, notifications, and server notifications in input order', async () => {
  const state = setup();
  await state.connection.acceptChunk(Buffer.concat([
    clientFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    clientFrame({ jsonrpc: '2.0', method: 'initialized', params: {} }),
    clientFrame({ jsonrpc: '2.0', method: 'emit', params: {} }),
  ]));
  assert.deepEqual(state.calls, [
    { kind: 'request', method: 'initialize', params: {} },
    { kind: 'notification', method: 'initialized', params: {} },
    { kind: 'notification', method: 'emit', params: {} },
  ]);
  assert.deepEqual(state.output.map(decodeFrame), [
    { jsonrpc: '2.0', id: 1, result: { method: 'initialize' } },
    { jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'safe' } },
  ]);
});

test('maps request failures and unknown exceptions to source-free responses', async () => {
  const errors = [
    new LanguageServerError('method_not_found', 'secret method'),
    new LanguageServerError('document_uri_invalid', 'secret uri'),
    new Error('secret internal'),
  ];
  let index = 0;
  const state = setup({
    session: {
      async request() { throw errors[index++]; },
      async notify() {},
      dispose() {},
    },
  });
  for (let id = 1; id <= errors.length; id += 1) {
    await state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id, method: 'x' }));
  }
  const responses = state.output.map(decodeFrame);
  assert.deepEqual(responses.map(({ error }) => error.code), [-32601, -32602, -32603]);
  assert.equal(JSON.stringify(responses).includes('secret'), false);
});

test('maps rejected notifications to one fixed log and returns no response', async () => {
  const state = setup({
    session: {
      async request() { return null; },
      async notify() { throw new Error('secret notification'); },
      dispose() {},
    },
  });
  await state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', method: 'initialized', params: {} }));
  assert.deepEqual(state.output.map(decodeFrame), [{
    jsonrpc: '2.0',
    method: 'window/logMessage',
    params: { type: 1, message: 'DiagramWeave rejected a client notification.' },
  }]);
});

test('reports graceful exit only after a successful shutdown request', async () => {
  const graceful = setup({
    session: {
      async request(method) { return method === 'shutdown' ? null : {}; },
      async notify() {},
      dispose() {},
    },
  });
  await graceful.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 1, method: 'shutdown' }));
  await graceful.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', method: 'exit' }));
  assert.deepEqual(graceful.exits, [0]);
  assert.deepEqual(decodeFrame(graceful.output[0]), { jsonrpc: '2.0', id: 1, result: null });

  const abnormal = setup();
  await abnormal.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', method: 'exit' }));
  assert.deepEqual(abnormal.exits, [1]);
  await assert.rejects(
    abnormal.connection.acceptChunk(Buffer.alloc(0)),
    (error) => assertTransport(error, 'connection_closed'),
  );
});

test('does not mark shutdown graceful when the session rejects it', async () => {
  const state = setup({
    session: {
      async request() { throw new LanguageServerError('server_shutting_down', 'safe'); },
      async notify() {},
      dispose() {},
    },
  });
  await state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 1, method: 'shutdown' }));
  await state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', method: 'exit' }));
  assert.deepEqual(state.exits, [1]);
});

test('emits parse and framing errors then closes the connection', async () => {
  for (const input of [
    rawClientFrame('{'),
    Buffer.from('Bad: Header\r\n\r\n', 'ascii'),
  ]) {
    const state = setup();
    await assert.rejects(state.connection.acceptChunk(input), LanguageServerStdioError);
    assert.equal(decodeFrame(state.output[0]).error.code, -32700);
    assert.deepEqual(state.exits, [1]);
    assert.equal(state.getDisposed(), 1);
  }
});

test('ends clean and truncated streams as abnormal exits', async () => {
  const clean = setup();
  await clean.connection.end();
  assert.deepEqual(clean.exits, [1]);

  const truncated = setup();
  await truncated.connection.acceptChunk(Buffer.from('Content-Length: 2\r\n\r\nx', 'ascii'));
  await assert.rejects(truncated.connection.end(), LanguageServerStdioError);
  assert.equal(decodeFrame(truncated.output[0]).error.code, -32700);
  assert.deepEqual(truncated.exits, [1]);
});

test('serializes concurrent chunks before dispatching later requests', async () => {
  const gate = deferred();
  const calls = [];
  const state = setup({
    session: {
      async request(method) {
        calls.push(method);
        if (method === 'first') await gate.promise;
        return method;
      },
      async notify() {},
      dispose() {},
    },
  });
  const first = state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 1, method: 'first' }));
  const second = state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 2, method: 'second' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['first']);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(state.output.map(decodeFrame).map(({ id }) => id), [1, 2]);
});

test('bounds concurrent queued chunks and terminates on overflow', async () => {
  const gate = deferred();
  const state = setup({
    session: {
      async request() { await gate.promise; return null; },
      async notify() {},
      dispose() {},
    },
  });
  const queued = [];
  for (let index = 0; index < languageServerStdioLimits.maxPendingMessages; index += 1) {
    queued.push(state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: index, method: 'x' })));
  }
  await assert.rejects(
    state.connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 999, method: 'x' })),
    (error) => assertTransport(error, 'message_queue_overflow'),
  );
  assert.deepEqual(state.exits, [1]);
  gate.resolve();
  await Promise.allSettled(queued);
});

test('normalizes output failures and suppresses exit/dispose observer failures', async () => {
  let disposeCalls = 0;
  const connection = createLanguageServerStdioConnection({
    javaPath,
    jarPath,
    sessionFactory() {
      return {
        async request() { return null; },
        async notify() {},
        dispose() { disposeCalls += 1; throw new Error('dispose secret'); },
      };
    },
    async writeBytes() { throw new Error('output secret'); },
    onExit() { throw new Error('exit secret'); },
  });
  await assert.rejects(
    connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 1, method: 'x' })),
    (error) => assertTransport(error, 'output_failed'),
  );
  assert.equal(disposeCalls, 1);
  connection.abort();
  assert.equal(disposeCalls, 1);
});

test('rejects invalid options, hostile getters, and malformed session contracts', () => {
  for (const options of [null, [], {}, { writeBytes() {}, onExit: 'bad' }]) {
    assert.throws(
      () => createLanguageServerStdioConnection(options),
      (error) => assertTransport(error, 'invalid_options'),
    );
  }
  const hostile = new Proxy({}, {
    getPrototypeOf() { throw new Error('secret'); },
  });
  assert.throws(
    () => createLanguageServerStdioConnection(hostile),
    (error) => assertTransport(error, 'invalid_options'),
  );
  const hostileGetter = new Proxy({ writeBytes() {} }, {
    get(target, property) {
      if (property === 'onExit') throw new Error('secret');
      return target[property];
    },
  });
  assert.throws(
    () => createLanguageServerStdioConnection(hostileGetter),
    (error) => assertTransport(error, 'invalid_options'),
  );
  for (const session of [null, {}, { request() {}, notify() {}, dispose: 'bad' }]) {
    assert.throws(
      () => createLanguageServerStdioConnection({
        javaPath,
        jarPath,
        writeBytes() {},
        sessionFactory: () => session,
      }),
      (error) => assertTransport(error, 'session_unavailable'),
    );
  }
  assert.throws(
    () => createLanguageServerStdioConnection({
      javaPath,
      jarPath,
      writeBytes() {},
      sessionFactory() { throw new Error('secret'); },
    }),
    (error) => assertTransport(error, 'session_unavailable'),
  );
});

test('accepts a null-prototype connection options record', () => {
  const options = Object.create(null);
  options.javaPath = javaPath;
  options.jarPath = jarPath;
  options.writeBytes = async () => undefined;
  options.onExit = () => undefined;
  options.sessionFactory = () => ({
    async request() { return null; },
    async notify() {},
    dispose() {},
  });
  const connection = createLanguageServerStdioConnection(options);
  connection.abort();
});

test('uses the production session factory and optional no-op exit observer by default', async () => {
  const output = [];
  const connection = createLanguageServerStdioConnection({
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({ async render() { return Object.freeze({}); } }),
    async writeBytes(bytes) { output.push(Buffer.from(bytes)); },
  });
  await connection.acceptChunk(clientFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
  assert.equal(decodeFrame(output[0]).result.serverInfo.name, 'DiagramWeave Language Server');
  connection.abort();
});

test('server notification sink rejects output after the connection closes', async () => {
  const state = setup();
  const publish = state.getPublish();
  state.connection.abort();
  await assert.rejects(
    publish('window/logMessage', { type: 3, message: 'safe' }),
    (error) => assertTransport(error, 'connection_closed'),
  );
});

test('aborts exactly once and suppresses later protocol output', () => {
  const state = setup();
  state.connection.abort();
  state.connection.abort();
  assert.deepEqual(state.exits, [1]);
  assert.equal(state.getDisposed(), 1);
});
