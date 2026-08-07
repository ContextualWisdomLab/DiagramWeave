import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { createHoverLanguageServerSession } from '../src/hover-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

async function readySession() {
  const session = createHoverLanguageServerSession({
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
    capabilities: { textDocument: { hover: {} } },
  });
  await session.notify('initialized', {});
  return session;
}

test('hover session directly normalizes every malformed document mutation shape', async () => {
  const session = await readySession();

  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.notify('textDocument/didOpen', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  for (const params of [
    null,
    {},
    { textDocument: null, contentChanges: [] },
    { textDocument: {}, contentChanges: [] },
    { textDocument: {}, contentChanges: [{}] },
  ]) {
    await assert.rejects(
      session.notify('textDocument/didChange', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      session.notify('textDocument/didClose', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
});
