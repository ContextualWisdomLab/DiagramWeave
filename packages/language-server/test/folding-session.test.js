import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import {
  createFoldingLanguageServerSession,
} from '../src/folding-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/folding.puml';
const defaultSource = [
  'package Platform {',
  '  namespace api {',
  '    class Gateway',
  '  }',
  '}',
].join('\n');

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setup(renderer = Object.freeze({
  async render() {
    return Object.freeze({});
  },
})) {
  return createFoldingLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => renderer,
    async publishNotification() {},
  });
}

function initializeParams(foldingRange = {}) {
  return {
    capabilities: {
      textDocument: {
        foldingRange,
      },
    },
  };
}

function openParams(text = defaultSource, version = 1, documentUri = uri) {
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

function foldingParams(documentUri = uri) {
  return { textDocument: { uri: documentUri } };
}

async function initialize(session, foldingRange = {}) {
  const result = await session.request('initialize', initializeParams(foldingRange));
  await session.notify('initialized', {});
  return result;
}

async function ranges(session, documentUri = uri) {
  return session.request('textDocument/foldingRange', foldingParams(documentUri));
}

test('advertises folding and serves the latest accepted source snapshot', async () => {
  const session = setup();
  await assert.rejects(
    ranges(session),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const result = await session.request('initialize', initializeParams());
  assert.equal(result.capabilities.foldingRangeProvider, true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  await assert.rejects(
    ranges(session),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    ranges(session),
    (error) => assertError(error, 'document_not_open'),
  );

  await session.notify('textDocument/didOpen', openParams());
  assert.deepEqual(await ranges(session), [
    { startLine: 0, endLine: 4 },
    { startLine: 1, endLine: 3 },
  ]);

  await session.notify('textDocument/didChange', changeParams([
    'package Updated {',
    '  class Model',
    '}',
  ].join('\n')));
  assert.deepEqual(await ranges(session), [{ startLine: 0, endLine: 2 }]);

  await session.notify('textDocument/didClose', foldingParams());
  await assert.rejects(
    ranges(session),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('does not advertise or serve folding for absent malformed or hostile capabilities', async () => {
  const ordinaryUnsupported = [
    {},
    { capabilities: [] },
    { capabilities: {} },
    { capabilities: { textDocument: [] } },
    { capabilities: { textDocument: {} } },
    { capabilities: { textDocument: { foldingRange: [] } } },
    { capabilities: { textDocument: { foldingRange: 'yes' } } },
  ];

  for (const params of ordinaryUnsupported) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.foldingRangeProvider, undefined);
    await session.notify('initialized', {});
    await assert.rejects(
      ranges(session),
      (error) => assertError(error, 'method_not_found'),
    );
  }

  const hostileValues = [
    Object.defineProperty({}, 'capabilities', {
      get() {
        throw new Error('capability secret');
      },
    }),
    {
      capabilities: Object.defineProperty({}, 'textDocument', {
        get() {
          throw new Error('text document secret');
        },
      }),
    },
    {
      capabilities: {
        textDocument: Object.defineProperty({}, 'foldingRange', {
          get() {
            throw new Error('folding secret');
          },
        }),
      },
    },
    {
      capabilities: {
        textDocument: {
          foldingRange: Object.defineProperty({}, 'rangeLimit', {
            get() {
              throw new Error('limit secret');
            },
          }),
        },
      },
    },
  ];

  for (const params of hostileValues) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.foldingRangeProvider, undefined);
  }
});

test('honors valid client range limits and rejects malformed folding options', async () => {
  const source = [
    'package One {',
    '  class First',
    '}',
    'package Two {',
    '  class Second',
    '}',
  ].join('\n');

  for (const [foldingRange, expected] of [
    [{}, [{ startLine: 0, endLine: 2 }, { startLine: 3, endLine: 5 }]],
    [{ rangeLimit: 0 }, []],
    [{ rangeLimit: 1 }, [{ startLine: 0, endLine: 2 }]],
    [{ rangeLimit: 2_147_483_647 }, [{ startLine: 0, endLine: 2 }, { startLine: 3, endLine: 5 }]],
    [{ lineFoldingOnly: true }, [{ startLine: 0, endLine: 2 }, { startLine: 3, endLine: 5 }]],
    [{ lineFoldingOnly: false }, [{ startLine: 0, endLine: 2 }, { startLine: 3, endLine: 5 }]],
  ]) {
    const session = setup();
    await initialize(session, foldingRange);
    await session.notify('textDocument/didOpen', openParams(source));
    assert.deepEqual(await ranges(session), expected);
  }

  for (const foldingRange of [
    { rangeLimit: -1 },
    { rangeLimit: 1.5 },
    { rangeLimit: '1' },
    { rangeLimit: Number.MAX_SAFE_INTEGER },
    { lineFoldingOnly: 'true' },
  ]) {
    const session = setup();
    const result = await session.request('initialize', initializeParams(foldingRange));
    assert.equal(result.capabilities.foldingRangeProvider, undefined);
  }
});

test('rejects malformed folding requests and remote document identifiers', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.request('textDocument/foldingRange', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  await assert.rejects(
    ranges(session, 'https://example.com/model.puml'),
    (error) => assertError(error, 'document_uri_invalid'),
  );
  const hostile = {
    textDocument: Object.defineProperty({}, 'uri', {
      get() {
        throw new Error('request secret');
      },
    }),
  };
  await assert.rejects(
    session.request('textDocument/foldingRange', hostile),
    (error) => assertError(error, 'invalid_request'),
  );
});

test('folding requests fail with lifecycle codes after shutdown exit and disposal', async () => {
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
      ranges(session),
      (error) => assertError(error, 'server_shutting_down'),
    );
  }
});

test('rejected mutations preserve the last accepted folding snapshot', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

  await assert.rejects(
    session.notify('textDocument/didOpen', openParams('package Other {\n  class X\n}', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  await assert.rejects(
    session.notify('textDocument/didChange', changeParams('package Other {\n  class X\n}', 1)),
    (error) => assertError(error, 'document_version_out_of_order'),
  );
  await assert.rejects(
    session.notify('textDocument/didChange', {
      textDocument: { uri, version: 2 },
      contentChanges: [{
        text: 'package Other {\n  class X\n}',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
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

  assert.deepEqual(await ranges(session), [
    { startLine: 0, endLine: 4 },
    { startLine: 1, endLine: 3 },
  ]);
});

test('a rejected newer open does not suppress an earlier pending folding source', async () => {
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
    session.notify('textDocument/didOpen', openParams('package Other {\n  class X\n}', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(await ranges(session), [
    { startLine: 0, endLine: 4 },
    { startLine: 1, endLine: 3 },
  ]);
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
  await session.notify('textDocument/didChange', changeParams([
    'package New {',
    '  class Model',
    '}',
  ].join('\n')));
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(await ranges(session), [{ startLine: 0, endLine: 2 }]);
});

test('a close completed during validation prevents folding-source resurrection', async () => {
  const pending = deferred();
  const session = setup(Object.freeze({ render: () => pending.promise }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams());
  await session.notify('textDocument/didClose', foldingParams());
  pending.resolve(Object.freeze({}));
  await opening;

  await assert.rejects(
    ranges(session),
    (error) => assertError(error, 'document_not_open'),
  );
});
