import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/model.puml';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

async function documentSymbolMessages(initializeParams) {
  const output = [];
  const connection = createLanguageServerStdioConnection({
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({
      async render() {
        return Object.freeze({});
      },
    }),
    async writeBytes(bytes) {
      output.push(Buffer.from(bytes));
    },
  });

  await connection.acceptChunk(Buffer.concat([
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: initializeParams,
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'initialized', params: {} }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'plantuml',
          version: 1,
          text: 'package Core {\n  class Api\n}\n',
        },
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/documentSymbol',
      params: { textDocument: { uri } },
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 3, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));

  return output.map(decodeFrame);
}

test('serves hierarchical document symbols through the real bounded stdio transport', async () => {
  const messages = await documentSymbolMessages({
    capabilities: {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      },
    },
  });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const symbolResponse = messages.find(({ id }) => id === 2);
  const shutdownResponse = messages.find(({ id }) => id === 3);

  assert.equal(initializeResponse.result.capabilities.documentSymbolProvider, true);
  assert.deepEqual(symbolResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: [
      {
        name: 'Core',
        detail: 'package',
        kind: 4,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 2, character: 1 },
        },
        selectionRange: {
          start: { line: 0, character: 8 },
          end: { line: 0, character: 12 },
        },
        children: [
          {
            name: 'Api',
            detail: 'class',
            kind: 5,
            range: {
              start: { line: 1, character: 2 },
              end: { line: 1, character: 11 },
            },
            selectionRange: {
              start: { line: 1, character: 8 },
              end: { line: 1, character: 11 },
            },
          },
        ],
      },
    ],
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 3, result: null });
});

test('serves flat symbol information to legacy clients through the same stdio transport', async () => {
  const messages = await documentSymbolMessages({ capabilities: {} });
  const symbolResponse = messages.find(({ id }) => id === 2);

  assert.deepEqual(symbolResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: [
      {
        name: 'Core',
        kind: 4,
        location: {
          uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 2, character: 1 },
          },
        },
      },
      {
        name: 'Api',
        kind: 5,
        location: {
          uri,
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 11 },
          },
        },
        containerName: 'Core',
      },
    ],
  });
});
