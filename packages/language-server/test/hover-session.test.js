import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { createHoverLanguageServerSession } from '../src/hover-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/hover.puml';
const defaultSource = [
  'package Platform {',
  '  class Gateway',
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
  return createHoverLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => renderer,
    async publishNotification() {},
  });
}

function initializeParams(hover = {}) {
  return {
    capabilities: {
      textDocument: {
        hover,
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

function hoverParams(line = 1, character = 9, documentUri = uri) {
  return {
    textDocument: { uri: documentUri },
    position: { line, character },
  };
}

async function initialize(session, hover = {}) {
  const result = await session.request('initialize', initializeParams(hover));
  await session.notify('initialized', {});
  return result;
}

async function hover(session, line = 1, character = 9, documentUri = uri) {
  return session.request('textDocument/hover', hoverParams(line, character, documentUri));
}

test('advertises hover and serves the latest accepted source snapshot', async () => {
  const session = setup();
  await assert.rejects(
    hover(session),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const result = await session.request('initialize', initializeParams());
  assert.equal(result.capabilities.hoverProvider, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  await assert.rejects(
    hover(session),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    hover(session),
    (error) => assertError(error, 'document_not_open'),
  );

  await session.notify('textDocument/didOpen', openParams());
  assert.deepEqual(await hover(session), {
    contents: {
      kind: 'plaintext',
      value: 'PlantUML class declaration\nName: Gateway\nContainer: Platform',
    },
    range: {
      start: { line: 1, character: 8 },
      end: { line: 1, character: 15 },
    },
  });
  assert.equal(await hover(session, 1, 15), null);

  await session.notify('textDocument/didChange', changeParams('component Model'));
  assert.deepEqual(await hover(session, 0, 11), {
    contents: {
      kind: 'plaintext',
      value: 'PlantUML component declaration\nName: Model',
    },
    range: {
      start: { line: 0, character: 10 },
      end: { line: 0, character: 15 },
    },
  });

  await session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    hover(session, 0, 11),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('negotiates bounded client markup preference in declared order', async () => {
  for (const [contentFormat, expectedKind] of [
    [undefined, 'plaintext'],
    [['markdown', 'plaintext'], 'markdown'],
    [['plaintext', 'markdown'], 'plaintext'],
  ]) {
    const session = setup();
    const capability = contentFormat === undefined ? {} : { contentFormat };
    await initialize(session, capability);
    await session.notify('textDocument/didOpen', openParams());
    const result = await hover(session);
    assert.equal(result.contents.kind, expectedKind);
    if (expectedKind === 'markdown') {
      assert.match(result.contents.value, /^```text\n/u);
    }
  }
});

test('does not advertise or serve hover for absent malformed unsupported or hostile capabilities', async () => {
  const unsupported = [
    {},
    { capabilities: [] },
    { capabilities: {} },
    { capabilities: { textDocument: [] } },
    { capabilities: { textDocument: {} } },
    { capabilities: { textDocument: { hover: [] } } },
    { capabilities: { textDocument: { hover: 'yes' } } },
    initializeParams({ contentFormat: 'markdown' }),
    initializeParams({ contentFormat: [] }),
    initializeParams({ contentFormat: ['html'] }),
    initializeParams({ contentFormat: ['plaintext', 1] }),
    initializeParams({ contentFormat: Array.from({ length: 17 }, () => 'plaintext') }),
  ];

  for (const params of unsupported) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.hoverProvider, undefined);
    await session.notify('initialized', {});
    await assert.rejects(
      hover(session),
      (error) => assertError(error, 'method_not_found'),
    );
  }

  const hostileArray = new Proxy(['plaintext'], {
    get(target, property, receiver) {
      if (property === 'length') {
        throw new Error('secret length');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const revoked = Proxy.revocable(['plaintext'], {});
  revoked.revoke();
  const hostile = [
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
        textDocument: Object.defineProperty({}, 'hover', {
          get() {
            throw new Error('hover secret');
          },
        }),
      },
    },
    initializeParams(Object.defineProperty({}, 'contentFormat', {
      get() {
        throw new Error('format secret');
      },
    })),
    initializeParams({ contentFormat: hostileArray }),
    initializeParams({ contentFormat: revoked.proxy }),
  ];

  for (const params of hostile) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.hoverProvider, undefined);
  }
});

test('rejects malformed hover params hostile positions remote URIs and positions outside source', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.request('textDocument/hover', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  for (const params of [
    { textDocument: { uri } },
    { textDocument: { uri }, position: null },
    { textDocument: { uri }, position: {} },
    hoverParams(99, 0),
    hoverParams(0, 99),
  ]) {
    await assert.rejects(
      session.request('textDocument/hover', params),
      (error) => assertError(error, 'document_position_invalid'),
    );
  }
  await assert.rejects(
    hover(session, 0, 0, 'https://example.com/model.puml'),
    (error) => assertError(error, 'document_uri_invalid'),
  );

  const hostileUri = {
    textDocument: Object.defineProperty({}, 'uri', {
      get() {
        throw new Error('uri secret');
      },
    }),
    position: { line: 0, character: 0 },
  };
  await assert.rejects(
    session.request('textDocument/hover', hostileUri),
    (error) => assertError(error, 'invalid_request'),
  );

  const hostilePosition = {
    textDocument: { uri },
    position: Object.defineProperty({}, 'line', {
      get() {
        throw new Error('position secret');
      },
    }),
  };
  await assert.rejects(
    session.request('textDocument/hover', hostilePosition),
    (error) => assertError(error, 'document_position_invalid'),
  );
});

test('hover requests fail with lifecycle codes after shutdown exit and disposal', async () => {
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
      hover(session),
      (error) => assertError(error, 'server_shutting_down'),
    );
  }
});

test('rejected mutations preserve the last accepted hover snapshot', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

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
      contentChanges: [{ text: 'class X', range: {} }],
    }),
    (error) => assertError(error, 'incremental_change_unsupported'),
  );
  await assert.rejects(
    session.notify('textDocument/didClose', {
      textDocument: { uri: 'file:///workspace/missing.puml' },
    }),
    (error) => assertError(error, 'document_not_open'),
  );

  assert.equal((await hover(session)).contents.value.includes('Gateway'), true);
});

test('a rejected newer open does not suppress an earlier pending hover source', async () => {
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
    session.notify('textDocument/didOpen', openParams('class Duplicate', 2)),
    (error) => assertError(error, 'document_already_open'),
  );
  first.resolve(Object.freeze({}));
  await opening;

  assert.equal((await hover(session)).contents.value.includes('Gateway'), true);
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
  await session.notify('textDocument/didChange', changeParams('class New'));
  first.resolve(Object.freeze({}));
  await opening;

  assert.equal((await hover(session, 0, 7)).contents.value.includes('New'), true);
});

test('a close completed during validation prevents hover-source resurrection', async () => {
  const pending = deferred();
  const session = setup(Object.freeze({ render: () => pending.promise }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams());
  await session.notify('textDocument/didClose', { textDocument: { uri } });
  pending.resolve(Object.freeze({}));
  await opening;

  await assert.rejects(
    hover(session),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('hover layer normalizes hostile document mutation boundaries directly', async () => {
  const session = setup();
  await initialize(session);

  const hostileOpen = Object.defineProperty({}, 'textDocument', {
    get() {
      throw new Error('open secret');
    },
  });
  await assert.rejects(
    session.notify('textDocument/didOpen', hostileOpen),
    (error) => assertError(error, 'invalid_request'),
  );

  await session.notify('textDocument/didOpen', openParams());
  const hostileChanges = new Proxy([], {
    get(target, property, receiver) {
      if (property === 'length') {
        throw new Error('change secret');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  await assert.rejects(
    session.notify('textDocument/didChange', {
      textDocument: { uri, version: 2 },
      contentChanges: hostileChanges,
    }),
    (error) => assertError(error, 'invalid_request'),
  );

  const hostileClose = Object.defineProperty({}, 'textDocument', {
    get() {
      throw new Error('close secret');
    },
  });
  await assert.rejects(
    session.notify('textDocument/didClose', hostileClose),
    (error) => assertError(error, 'invalid_request'),
  );
});
