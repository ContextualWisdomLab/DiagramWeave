import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { createHoverLanguageServerSession } from '../src/hover-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';

function setup() {
  return createHoverLanguageServerSession({
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

function assertDocumentUriError(error) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, 'document_uri_invalid');
  return true;
}

test('direct hover mutation normalization preserves trusted URI errors', async () => {
  const session = setup();
  await session.request('initialize', {
    capabilities: { textDocument: { hover: {} } },
  });
  await session.notify('initialized', {});

  await assert.rejects(
    session.notify('textDocument/didOpen', {
      textDocument: {
        uri: 'https://example.com/remote.puml',
        languageId: 'plantuml',
        version: 1,
        text: '@startuml\n@enduml\n',
      },
    }),
    assertDocumentUriError,
  );

  await assert.rejects(
    session.notify('textDocument/didClose', {
      textDocument: { uri: 'https://example.com/remote.puml' },
    }),
    assertDocumentUriError,
  );
});
