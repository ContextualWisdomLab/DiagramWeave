import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LanguageServerError,
  createLanguageServerSession,
} from '../src/index.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

test('completion collapses a hostile URI getter to one stable request error', async () => {
  const session = createLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({
      async render() {
        return Object.freeze({});
      },
    }),
    async publishNotification() {},
  });
  await session.request('initialize', {
    capabilities: { textDocument: { completion: {} } },
  });
  await session.notify('initialized', {});

  const textDocument = Object.defineProperty({}, 'uri', {
    get() {
      throw new Error('host URI secret');
    },
  });
  await assert.rejects(
    session.request('textDocument/completion', {
      textDocument,
      position: { line: 0, character: 0 },
    }),
    (error) => assertError(error, 'invalid_request'),
  );
});
