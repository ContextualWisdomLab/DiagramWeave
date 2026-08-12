import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefinitionLanguageServerSession } from '../src/definition-session.js';
import { LanguageServerError } from '../src/errors.js';
import { createReferenceLanguageServerSession } from '../src/reference-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/session-normalization.puml';

function createOptions() {
  return {
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({
      async render() {
        return Object.freeze({});
      },
    }),
    async publishNotification() {},
  };
}

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

async function initialize(session, textDocumentCapabilities) {
  await session.request('initialize', {
    capabilities: { textDocument: textDocumentCapabilities },
  });
  await session.notify('initialized', {});
}

test('definition composition rejects malformed mutation envelopes before delegation', async () => {
  const session = createDefinitionLanguageServerSession(createOptions());
  await initialize(session, { definition: {} });

  const malformedMutations = [
    ['textDocument/didOpen', null],
    ['textDocument/didChange', null],
    [
      'textDocument/didChange',
      {
        textDocument: { uri, version: 2 },
        contentChanges: [],
      },
    ],
    ['textDocument/didClose', null],
  ];

  for (const [method, params] of malformedMutations) {
    await assert.rejects(
      session.notify(method, params),
      (error) => assertError(error, 'invalid_request'),
    );
  }

  await assert.rejects(
    session.notify('textDocument/didOpen', {
      textDocument: {
        uri: 'https://example.com/remote.puml',
        languageId: 'plantuml',
        version: 1,
        text: '@startuml\n@enduml\n',
      },
    }),
    (error) => assertError(error, 'document_uri_invalid'),
  );

  await assert.rejects(
    session.notify('textDocument/didClose', {
      textDocument: { uri: 'https://example.com/remote.puml' },
    }),
    (error) => assertError(error, 'document_uri_invalid'),
  );
});

test('reference composition rejects a non-record position at its own boundary', async () => {
  const session = createReferenceLanguageServerSession(createOptions());
  await initialize(session, { definition: {}, references: {} });

  await assert.rejects(
    session.request('textDocument/references', {
      textDocument: { uri },
      position: null,
      context: { includeDeclaration: true },
    }),
    (error) => assertError(error, 'document_position_invalid'),
  );
});
