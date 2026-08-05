import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDocumentSymbolLanguageServerSession,
} from '../src/symbol-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/compatibility.puml';
const source = [
  'package Platform {',
  '  class Gateway',
  '}',
  'class External',
].join('\n');

function setup() {
  return createDocumentSymbolLanguageServerSession({
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

async function symbolsForInitializeParams(params) {
  const session = setup();
  await session.request('initialize', params);
  await session.notify('initialized', {});
  await session.notify('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: 'plantuml',
      version: 1,
      text: source,
    },
  });
  return session.request('textDocument/documentSymbol', {
    textDocument: { uri },
  });
}

test('returns the authoritative hierarchy only to clients that explicitly support it', async () => {
  const symbols = await symbolsForInitializeParams({
    capabilities: {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      },
    },
  });

  assert.deepEqual(symbols.map(({ name }) => name), ['Platform', 'External']);
  assert.deepEqual(symbols[0].children.map(({ name }) => name), ['Gateway']);
  assert.equal(symbols[0].location, undefined);
  assert.equal(Object.isFrozen(symbols), true);
});

test('returns immutable flat symbol information when hierarchy support is absent or false', async () => {
  const parameterSets = [
    null,
    {},
    { capabilities: [] },
    { capabilities: {} },
    { capabilities: { textDocument: [] } },
    { capabilities: { textDocument: {} } },
    { capabilities: { textDocument: { documentSymbol: [] } } },
    { capabilities: { textDocument: { documentSymbol: {} } } },
    {
      capabilities: {
        textDocument: {
          documentSymbol: { hierarchicalDocumentSymbolSupport: false },
        },
      },
    },
  ];

  for (const params of parameterSets) {
    const symbols = await symbolsForInitializeParams(params);
    assert.deepEqual(symbols.map(({ name }) => name), [
      'Platform',
      'Gateway',
      'External',
    ]);
    assert.equal(symbols[0].containerName, undefined);
    assert.equal(symbols[1].containerName, 'Platform');
    assert.equal(symbols[2].containerName, undefined);
    assert.equal(symbols[0].location.uri, uri);
    assert.equal(symbols[0].children, undefined);
    assert.equal(Object.isFrozen(symbols), true);
    assert.equal(Object.isFrozen(symbols[1]), true);
    assert.equal(Object.isFrozen(symbols[1].location), true);
  }
});

test('hostile document-symbol capabilities fail closed to the flat response', async () => {
  const hostileValues = [
    Object.defineProperty({}, 'capabilities', {
      get() {
        throw new Error('capabilities secret');
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
        textDocument: Object.defineProperty({}, 'documentSymbol', {
          get() {
            throw new Error('document symbol secret');
          },
        }),
      },
    },
    {
      capabilities: {
        textDocument: {
          documentSymbol: Object.defineProperty({}, 'hierarchicalDocumentSymbolSupport', {
            get() {
              throw new Error('hierarchy secret');
            },
          }),
        },
      },
    },
  ];

  for (const params of hostileValues) {
    const symbols = await symbolsForInitializeParams(params);
    assert.deepEqual(symbols.map(({ name }) => name), [
      'Platform',
      'Gateway',
      'External',
    ]);
    assert.equal(symbols[1].containerName, 'Platform');
  }
});
