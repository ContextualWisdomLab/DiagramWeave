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

function setup() {
  return createLanguageServerSession({
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

function completionParams(line, character, documentUri = uri) {
  return {
    textDocument: { uri: documentUri },
    position: { line, character },
  };
}

async function initialize(session) {
  const result = await session.request('initialize', completionCapabilities);
  await session.notify('initialized', {});
  return result;
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

  await session.notify('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: 'plantuml',
      version: 1,
      text: 'cl',
    },
  });
  assert.deepEqual(
    (await session.request('textDocument/completion', completionParams(0, 2))).map(({ label }) => label),
    ['class', 'cloud'],
  );

  await session.notify('textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: 'par' }],
  });
  assert.deepEqual(
    (await session.request('textDocument/completion', completionParams(0, 3))).map(({ label }) => label),
    ['participant'],
  );

  await session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    session.request('textDocument/completion', completionParams(0, 0)),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('does not advertise completion to clients that omit or hide the capability', async () => {
  const session = setup();
  const result = await session.request('initialize', {});
  assert.equal(result.capabilities.completionProvider, undefined);

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
  await session.notify('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: 'plantuml',
      version: 1,
      text: 'class',
    },
  });

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
    await session.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'plantuml',
        version: 1,
        text: 'cl',
      },
    });
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
