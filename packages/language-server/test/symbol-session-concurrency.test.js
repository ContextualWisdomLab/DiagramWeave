import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LanguageServerError,
  createLanguageServerSession,
} from '../src/index.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/concurrent.puml';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

test('an older completion waits behind a newer active mutation before outline publication', async () => {
  const first = deferred();
  const second = deferred();
  let renderCalls = 0;
  const session = createLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({
      render() {
        renderCalls += 1;
        return renderCalls === 1 ? first.promise : second.promise;
      },
    }),
    async publishNotification() {},
  });

  await session.request('initialize', {});
  await session.notify('initialized', {});

  const opening = session.notify('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: 'plantuml',
      version: 1,
      text: 'class Old',
    },
  });
  const changing = session.notify('textDocument/didChange', {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: 'class New' }],
  });

  first.resolve(Object.freeze({}));
  await opening;
  await assert.rejects(
    session.request('textDocument/documentSymbol', {
      textDocument: { uri },
    }),
    (error) => assertError(error, 'document_not_open'),
  );

  second.resolve(Object.freeze({}));
  await changing;
  assert.deepEqual(
    (await session.request('textDocument/documentSymbol', {
      textDocument: { uri },
    })).map(({ name }) => name),
    ['New'],
  );
});
