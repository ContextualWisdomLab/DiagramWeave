import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { createDefinitionLanguageServerSession } from '../src/definition-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/definition-session.puml';
const defaultSource = [
  'class "Order Service" as OrderService',
  'class Customer',
  'Customer --> OrderService : submits',
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
  return createDefinitionLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => renderer,
    async publishNotification() {},
  });
}

function initializeParams(definition = {}) {
  return {
    capabilities: {
      textDocument: {
        definition,
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

function definitionParams(line = 2, character = 16, documentUri = uri) {
  return {
    textDocument: { uri: documentUri },
    position: { line, character },
  };
}

async function initialize(session, definitionCapability = {}) {
  const result = await session.request(
    'initialize',
    initializeParams(definitionCapability),
  );
  await session.notify('initialized', {});
  return result;
}

async function definition(session, line = 2, character = 16, documentUri = uri) {
  return session.request(
    'textDocument/definition',
    definitionParams(line, character, documentUri),
  );
}

test('advertises definition and serves the latest accepted source snapshot', async () => {
  const session = setup();
  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const result = await session.request('initialize', initializeParams());
  assert.equal(result.capabilities.definitionProvider, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'document_not_open'),
  );

  await session.notify('textDocument/didOpen', openParams());
  assert.deepEqual(await definition(session), {
    uri,
    range: {
      start: { line: 0, character: 7 },
      end: { line: 0, character: 20 },
    },
  });
  assert.equal(await definition(session, 2, 8), null);

  await session.notify('textDocument/didChange', changeParams([
    'component "API Gateway" as ApiGateway',
    'ApiGateway --> ApiGateway',
  ].join('\n')));
  assert.deepEqual(await definition(session, 1, 2), {
    uri,
    range: {
      start: { line: 0, character: 11 },
      end: { line: 0, character: 22 },
    },
  });

  await session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    definition(session, 1, 2),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('does not advertise or serve definition for absent malformed or hostile capabilities', async () => {
  const unsupported = [
    {},
    { capabilities: [] },
    { capabilities: {} },
    { capabilities: { textDocument: [] } },
    { capabilities: { textDocument: {} } },
    { capabilities: { textDocument: { definition: [] } } },
    { capabilities: { textDocument: { definition: 'yes' } } },
  ];

  for (const params of unsupported) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.definitionProvider, undefined);
    await session.notify('initialized', {});
    await assert.rejects(
      definition(session),
      (error) => assertError(error, 'method_not_found'),
    );
  }

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = [
    Object.defineProperty({}, 'capabilities', {
      get() {
        throw new Error('capability getter failed');
      },
    }),
    {
      capabilities: Object.defineProperty({}, 'textDocument', {
        get() {
          throw new Error('text document getter failed');
        },
      }),
    },
    {
      capabilities: {
        textDocument: Object.defineProperty({}, 'definition', {
          get() {
            throw new Error('definition getter failed');
          },
        }),
      },
    },
    {
      capabilities: {
        textDocument: { definition: revoked.proxy },
      },
    },
  ];

  for (const params of hostile) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.definitionProvider, undefined);
  }
});

test('rejects malformed definition params hostile positions remote URIs and positions outside source', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.request('textDocument/definition', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  for (const params of [
    { textDocument: { uri } },
    { textDocument: { uri }, position: null },
    { textDocument: { uri }, position: {} },
    definitionParams(99, 0),
    definitionParams(0, 99),
  ]) {
    await assert.rejects(
      session.request('textDocument/definition', params),
      (error) => assertError(error, 'document_position_invalid'),
    );
  }
  await assert.rejects(
    definition(session, 0, 0, 'https://example.com/model.puml'),
    (error) => assertError(error, 'document_uri_invalid'),
  );

  const hostileUri = {
    textDocument: Object.defineProperty({}, 'uri', {
      get() {
        throw new Error('uri getter failed');
      },
    }),
    position: { line: 0, character: 0 },
  };
  await assert.rejects(
    session.request('textDocument/definition', hostileUri),
    (error) => assertError(error, 'invalid_request'),
  );

  const hostilePosition = {
    textDocument: { uri },
    position: Object.defineProperty({}, 'line', {
      get() {
        throw new Error('position getter failed');
      },
    }),
  };
  await assert.rejects(
    session.request('textDocument/definition', hostilePosition),
    (error) => assertError(error, 'document_position_invalid'),
  );
});

test('definition requests fail with lifecycle codes after shutdown exit and disposal', async () => {
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
      definition(session),
      (error) => assertError(error, 'server_shutting_down'),
    );
  }
});

test('rejected mutations preserve the last accepted definition snapshot', async () => {
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

  assert.deepEqual(await definition(session), {
    uri,
    range: {
      start: { line: 0, character: 7 },
      end: { line: 0, character: 20 },
    },
  });
});

test('a rejected newer open does not suppress an earlier pending definition source', async () => {
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

  assert.deepEqual(await definition(session), {
    uri,
    range: {
      start: { line: 0, character: 7 },
      end: { line: 0, character: 20 },
    },
  });
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
    'class "New Service" as NewService',
    'NewService --> NewService',
  ].join('\n')));
  first.resolve(Object.freeze({}));
  await opening;

  assert.deepEqual(await definition(session, 1, 2), {
    uri,
    range: {
      start: { line: 0, character: 7 },
      end: { line: 0, character: 18 },
    },
  });
});

test('a close completed during validation prevents definition-source resurrection', async () => {
  const pending = deferred();
  const session = setup(Object.freeze({ render: () => pending.promise }));
  await initialize(session);

  const opening = session.notify('textDocument/didOpen', openParams());
  await session.notify('textDocument/didClose', { textDocument: { uri } });
  pending.resolve(Object.freeze({}));
  await opening;

  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('definition layer normalizes hostile document mutation boundaries directly', async () => {
  const session = setup();
  await initialize(session);

  const hostileOpen = Object.defineProperty({}, 'textDocument', {
    get() {
      throw new Error('open getter failed');
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
        throw new Error('change length failed');
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
      throw new Error('close getter failed');
    },
  });
  await assert.rejects(
    session.notify('textDocument/didClose', hostileClose),
    (error) => assertError(error, 'invalid_request'),
  );
});
