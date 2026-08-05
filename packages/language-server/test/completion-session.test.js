import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LanguageServerError,
  createLanguageServerSession,
} from '../src/index.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/completion.puml';
const completionCapabilities = Object.freeze({
  capabilities: Object.freeze({
    textDocument: Object.freeze({
      completion: Object.freeze({}),
    }),
  }),
});

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
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

function setup(renderer = Object.freeze({
  async render() {
    return Object.freeze({});
  },
})) {
  return createLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => renderer,
    async publishNotification() {},
  });
}

function completionParams(line, character, documentUri = uri) {
  return {
    textDocument: { uri: documentUri },
    position: { line, character },
  };
}

function openParams(text = 'cl', version = 1, documentUri = uri) {
  return {
    textDocument: {
      uri: documentUri,
      languageId: 'plantuml',
      version,
      text,
    },
  };
}

function changeParams(text, version = 2, documentUri = uri) {
  return {
    textDocument: { uri: documentUri, version },
    contentChanges: [{ text }],
  };
}

async function initialize(session) {
  const result = await session.request('initialize', completionCapabilities);
  await session.notify('initialized', {});
  return result;
}

async function labelsAt(session, character, documentUri = uri) {
  return (await session.request(
    'textDocument/completion',
    completionParams(0, character, documentUri),
  )).map(({ label }) => label);
}

test('advertises deterministic completion and serves the latest open snapshot', async () => {
  const session = setup();
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 2)),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const result = await session.request('initialize', completionCapabilities);
  assert.deepEqual(result.capabilities.completionProvider, { resolveProvider: false });
  assert.equal(Object.isFrozen(result.capabilities.completionProvider), true);
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 2)),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 2)),
    (error) => assertError(error, 'document_not_open'),
  );

  await session.notify('textDocument/didOpen', openParams());
  assert.deepEqual(await labelsAt(session, 2), ['class', 'cloud']);

  await session.notify('textDocument/didChange', changeParams('par'));
  assert.deepEqual(await labelsAt(session, 3), ['participant']);

  await session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 0)),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('does not advertise or serve completion for clients that omit or hide the capability', async () => {
  const session = setup();
  const result = await session.request('initialize', {});
  assert.equal(result.capabilities.completionProvider, undefined);
  await session.notify('initialized', {});
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 0)),
    (error) => assertError(error, 'method_not_found'),
  );

  const hostileParams = Object.defineProperty({}, 'capabilities', {
    get() {
      throw new Error('capability secret');
    },
  });
  const hostileSession = setup();
  const hostileResult = await hostileSession.request('initialize', hostileParams);
  assert.equal(hostileResult.capabilities.completionProvider, undefined);
});

test('rejects malformed completion params hostile positions and remote URIs', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams('class'));

  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.request('textDocument/completion', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  await assert.rejects(
    session.request('textDocument/completion', { textDocument: { uri } }),
    (error) => assertError(error, 'document_position_invalid'),
  );
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 0, 'https://example.com/model.puml')),
    (error) => assertError(error, 'document_uri_invalid'),
  );
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 99)),
    (error) => assertError(error, 'document_position_invalid'),
  );
  const hostile = {
    textDocument: { uri },
    position: new Proxy({}, {
      get() {
        throw new Error('position secret');
      },
    }),
  };
  await assert.rejects(
    session.request('textDocument/completion', hostile),
    (error) => assertError(error, 'document_position_invalid'),
  );
});

test('completion fails with lifecycle codes after shutdown exit and disposal', async () => {
  for (const action of ['shutdown', 'exit', 'dispose']) {
    const session = setup();
    await initialize(session);
    await session.notify('textDocument/didOpen', openParams());
    if (action === 'shutdown') {
      await session.request('shutdown');
    } else if (action === 'exit') {
      await session.notify('exit');
    } else {
      session.dispose();
    }
    await assert.rejects(
      session.request('textDocument/completion', completionParams(0, 2)),
      (error) => assertError(error, 'server_shutting_down'),
    );
  }
});

test('rejected document mutations preserve the last accepted completion snapshot', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

  await assert.rejects(
    session.notify('textDocument/didOpen', openParams('par', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  await assert.rejects(
    session.notify('textDocument/didChange', changeParams('par', 1)),
    (error) => assertError(error, 'document_version_out_of_order'),
  );
  await assert.rejects(
    session.notify('textDocument/didChange', {
      textDocument: { uri, version: 2 },
      contentChanges: [{
        text: 'par',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 2 },
        },
      }],
    }),
    (error) => assertError(error, 'incremental_change_unsupported'),
  );
  await assert.rejects(
    session.notify('textDocument/didClose', {
      textDocument: { uri: 'file:///workspace/missing.puml' },
    }),
    (error) => assertError(error, 'document_not_open'),
  );

  assert.deepEqual(await labelsAt(session, 2), ['class', 'cloud']);
});

test('a rejected newer open does not suppress an earlier pending completion source', async () => {
  const first = deferred();
  let renderCalls = 0;
  const session = setup(Object.freeze({
    render() {
      renderCalls += 1;
      return renderCalls === 1 ? first.promise : Promise.resolve(Object.freeze({}));
    },
  }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams());
  await assert.rejects(
    session.notify('textDocument/didOpen', openParams('par', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(await labelsAt(session, 2), ['class', 'cloud']);
});

test('a newer accepted change supersedes an older renderer completion', async () => {
  const first = deferred();
  let renderCalls = 0;
  const session = setup(Object.freeze({
    render() {
      renderCalls += 1;
      return renderCalls === 1 ? first.promise : Promise.resolve(Object.freeze({}));
    },
  }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams());
  await session.notify('textDocument/didChange', changeParams('par'));
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(await labelsAt(session, 3), ['participant']);
});

test('a close completed during validation prevents completion-source resurrection', async () => {
  const pending = deferred();
  const session = setup(Object.freeze({ render: () => pending.promise }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams());
  await session.notify('textDocument/didClose', { textDocument: { uri } });
  pending.resolve(Object.freeze({}));
  await opening;

  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 2)),
    (error) => assertError(error, 'document_not_open'),
  );
});
