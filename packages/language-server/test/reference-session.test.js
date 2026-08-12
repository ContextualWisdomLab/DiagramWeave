import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { createReferenceLanguageServerSession } from '../src/reference-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/reference-session.puml';
const source = [
  'class "Order Service" as OrderService',
  'class Customer',
  'Customer --> OrderService : submits',
  'OrderService : submit()',
].join('\n');

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

function setup() {
  return createReferenceLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({
      async render() {
        return Object.freeze({});
      },
    }),
    async publishNotification() {},
  });
}

function initializeParams(references = {}) {
  return {
    capabilities: {
      textDocument: {
        definition: {},
        references,
      },
    },
  };
}

function openParams(text = source, version = 1) {
  return {
    textDocument: {
      uri,
      languageId: 'plantuml',
      version,
      text,
    },
  };
}

function referenceParams(includeDeclaration = true, line = 2, character = 16) {
  return {
    textDocument: { uri },
    position: { line, character },
    context: { includeDeclaration },
  };
}

async function initialize(session, references = {}) {
  const result = await session.request('initialize', initializeParams(references));
  await session.notify('initialized', {});
  return result;
}

test('negotiates references and serves the latest accepted source snapshot', async () => {
  const session = setup();
  await assert.rejects(
    session.request('textDocument/references', referenceParams()),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const initialized = await session.request('initialize', initializeParams());
  assert.equal(initialized.capabilities.referencesProvider, true);
  assert.equal(Object.isFrozen(initialized), true);
  assert.equal(Object.isFrozen(initialized.capabilities), true);
  await assert.rejects(
    session.request('textDocument/references', referenceParams()),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    session.request('textDocument/references', referenceParams()),
    (error) => assertError(error, 'document_not_open'),
  );
  await session.notify('textDocument/didOpen', openParams());

  assert.deepEqual(
    await session.request('textDocument/references', referenceParams(true)),
    [
      {
        uri,
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 20 },
        },
      },
      {
        uri,
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 25 },
        },
      },
      {
        uri,
        range: {
          start: { line: 3, character: 0 },
          end: { line: 3, character: 12 },
        },
      },
    ],
  );
  assert.equal(
    (await session.request('textDocument/references', referenceParams(false))).length,
    2,
  );

  const changed = [
    'component "API Gateway" as ApiGateway',
    'ApiGateway --> ApiGateway',
  ].join('\n');
  await session.notify('textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: changed }],
  });
  const latest = await session.request(
    'textDocument/references',
    referenceParams(true, 1, 2),
  );
  assert.equal(latest.length, 3);
  assert.equal(latest[0].range.start.line, 0);

  await session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    session.request('textDocument/references', referenceParams()),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('fails closed when references capability is absent malformed or hostile', async () => {
  const unsupported = [
    {},
    { capabilities: [] },
    { capabilities: {} },
    { capabilities: { textDocument: [] } },
    { capabilities: { textDocument: {} } },
    { capabilities: { textDocument: { definition: {}, references: [] } } },
    { capabilities: { textDocument: { definition: {}, references: true } } },
  ];
  for (const params of unsupported) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.referencesProvider, undefined);
    await session.notify('initialized', {});
    await assert.rejects(
      session.request('textDocument/references', referenceParams()),
      (error) => assertError(error, 'method_not_found'),
    );
  }

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = {
    capabilities: {
      textDocument: { definition: {}, references: revoked.proxy },
    },
  };
  const session = setup();
  const result = await session.request('initialize', hostile);
  assert.equal(result.capabilities.referencesProvider, undefined);
});

test('validates reference request shape context position and URI without retaining hostile values', async () => {
  const session = setup();
  await initialize(session);
  await session.notify('textDocument/didOpen', openParams());

  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.request('textDocument/references', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  for (const includeDeclaration of [null, 1, 'true', [], {}]) {
    await assert.rejects(
      session.request(
        'textDocument/references',
        referenceParams(includeDeclaration),
      ),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  await assert.rejects(
    session.request('textDocument/references', {
      ...referenceParams(),
      position: {},
    }),
    (error) => assertError(error, 'document_position_invalid'),
  );
  await assert.rejects(
    session.request('textDocument/references', {
      ...referenceParams(),
      textDocument: { uri: 'https://example.com/model.puml' },
    }),
    (error) => assertError(error, 'document_uri_invalid'),
  );

  const hostileContext = Object.defineProperty({}, 'includeDeclaration', {
    get() {
      throw new Error('private context value');
    },
  });
  await assert.rejects(
    session.request('textDocument/references', {
      ...referenceParams(),
      context: hostileContext,
    }),
    (error) => assertError(error, 'invalid_request'),
  );
});

test('lifecycle invalidation prevents references after shutdown exit and disposal', async () => {
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
      session.request('textDocument/references', referenceParams()),
      (error) => assertError(error, 'server_shutting_down'),
    );
  }
});
