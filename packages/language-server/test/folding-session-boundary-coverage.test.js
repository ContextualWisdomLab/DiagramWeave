import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import {
  createFoldingLanguageServerSession,
} from '../src/folding-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/folding-boundary.puml';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

function setup() {
  return createFoldingLanguageServerSession({
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

async function initialize(session) {
  await session.request('initialize', {
    capabilities: {
      textDocument: {
        foldingRange: {},
      },
    },
  });
  await session.notify('initialized', {});
}

test('folding session normalizes malformed opens and preserves trusted open errors', async () => {
  const session = setup();
  await initialize(session);

  for (const params of [null, {}]) {
    await assert.rejects(
      session.notify('textDocument/didOpen', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }

  await assert.rejects(
    session.notify('textDocument/didOpen', {
      textDocument: {
        uri: 'https://example.com/remote.puml',
        languageId: 'plantuml',
        version: 1,
        text: '@startuml\n@enduml',
      },
    }),
    (error) => assertError(error, 'document_uri_invalid'),
  );
});

test('folding session rejects every malformed full-document change collection', async () => {
  const session = setup();
  await initialize(session);

  const malformedChanges = [
    null,
    {},
    {
      textDocument: null,
      contentChanges: [{ text: '@startuml\n@enduml' }],
    },
    {
      textDocument: { uri, version: 2 },
      contentChanges: null,
    },
    {
      textDocument: { uri, version: 2 },
      contentChanges: [],
    },
    {
      textDocument: { uri, version: 2 },
      contentChanges: [null],
    },
  ];

  for (const params of malformedChanges) {
    await assert.rejects(
      session.notify('textDocument/didChange', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
});
