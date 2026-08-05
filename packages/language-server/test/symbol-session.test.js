import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LanguageServerError,
  createLanguageServerSession,
} from '../src/index.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/model.puml';

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

function setup(renderer = Object.freeze({ async render() { return Object.freeze({}); } })) {
  const notifications = [];
  const session = createLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => renderer,
    async publishNotification(method, params) {
      notifications.push({ method, params });
    },
  });
  return { session, notifications };
}

async function initialize(session) {
  const result = await session.request('initialize', {});
  await session.notify('initialized', {});
  return result;
}

function openParams(text = 'class Alpha', version = 1, documentUri = uri) {
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

function symbolParams(documentUri = uri) {
  return { textDocument: { uri: documentUri } };
}

test('advertises and serves immutable document symbols for the latest open snapshot', async () => {
  const { session } = setup();
  await assert.rejects(
    session.request('textDocument/documentSymbol', symbolParams()),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const result = await session.request('initialize', {});
  assert.equal(result.capabilities.documentSymbolProvider, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  await assert.rejects(
    session.request('textDocument/documentSymbol', symbolParams()),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    session.request('textDocument/documentSymbol', symbolParams()),
    (error) => assertError(error, 'document_not_open'),
  );

  await session.notify('textDocument/didOpen', openParams('class Alpha'));
  assert.deepEqual(
    (await session.request('textDocument/documentSymbol', symbolParams())).map(({ name }) => name),
    ['Alpha'],
  );

  await session.notify('textDocument/didChange', changeParams('class Beta'));
  const symbols = await session.request('textDocument/documentSymbol', symbolParams());
  assert.deepEqual(symbols.map(({ name }) => name), ['Beta']);
  assert.equal(Object.isFrozen(symbols), true);

  await session.notify('textDocument/didClose', symbolParams());
  await assert.rejects(
    session.request('textDocument/documentSymbol', symbolParams()),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('rejects malformed and non-local document-symbol request parameters', async () => {
  const { session } = setup();
  await initialize(session);
  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.request('textDocument/documentSymbol', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  const hostile = Object.defineProperty({}, 'textDocument', {
    get() {
      throw new Error('secret symbol getter');
    },
  });
  await assert.rejects(
    session.request('textDocument/documentSymbol', hostile),
    (error) => assertError(error, 'invalid_request'),
  );
  await assert.rejects(
    session.request('textDocument/documentSymbol', symbolParams('https://example.com/model.puml')),
    (error) => assertError(error, 'document_uri_invalid'),
  );
});

test('invalidates document symbols after shutdown, exit, and disposal', async () => {
  for (const action of ['shutdown', 'exit', 'dispose']) {
    const { session } = setup();
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
      session.request('textDocument/documentSymbol', symbolParams()),
      (error) => assertError(error, 'server_shutting_down'),
    );
  }
});

test('rejected document mutations preserve the last accepted outline snapshot', async () => {
  const { session } = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams('class Accepted'));

  await assert.rejects(
    session.notify('textDocument/didOpen', openParams('class Duplicate', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  await assert.rejects(
    session.notify('textDocument/didChange', changeParams('class Old', 1)),
    (error) => assertError(error, 'document_version_out_of_order'),
  );
  await assert.rejects(
    session.notify('textDocument/didChange', {
      textDocument: { uri, version: 2 },
      contentChanges: [{
        text: 'class Incremental',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      }],
    }),
    (error) => assertError(error, 'incremental_change_unsupported'),
  );
  await assert.rejects(
    session.notify('textDocument/didClose', symbolParams('file:///workspace/missing.puml')),
    (error) => assertError(error, 'document_not_open'),
  );

  assert.deepEqual(
    (await session.request('textDocument/documentSymbol', symbolParams())).map(({ name }) => name),
    ['Accepted'],
  );
});

test('a rejected newer open does not suppress an earlier pending valid open', async () => {
  const first = deferred();
  let renderCalls = 0;
  const { session } = setup(Object.freeze({
    render() {
      renderCalls += 1;
      return renderCalls === 1 ? first.promise : Promise.resolve(Object.freeze({}));
    },
  }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams('class Original'));
  await assert.rejects(
    session.notify('textDocument/didOpen', openParams('class Duplicate', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(
    (await session.request('textDocument/documentSymbol', symbolParams())).map(({ name }) => name),
    ['Original'],
  );
});

test('newer successful changes supersede older renderer completions', async () => {
  const first = deferred();
  let renderCalls = 0;
  const { session } = setup(Object.freeze({
    render() {
      renderCalls += 1;
      return renderCalls === 1 ? first.promise : Promise.resolve(Object.freeze({}));
    },
  }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams('class Old'));
  await session.notify('textDocument/didChange', changeParams('class New'));
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(
    (await session.request('textDocument/documentSymbol', symbolParams())).map(({ name }) => name),
    ['New'],
  );
});

test('a close completed during validation prevents the pending open from resurrecting symbols', async () => {
  const pending = deferred();
  const { session } = setup(Object.freeze({ render: () => pending.promise }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams('class Old'));
  await session.notify('textDocument/didClose', symbolParams());
  pending.resolve(Object.freeze({}));
  await opening;

  await assert.rejects(
    session.request('textDocument/documentSymbol', symbolParams()),
    (error) => assertError(error, 'document_not_open'),
  );
});
