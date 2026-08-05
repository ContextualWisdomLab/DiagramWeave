import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/completion.puml';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

test('serves declaration completion through the real stdio transport', async () => {
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
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'initialized', params: {} }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'plantuml',
          version: 1,
          text: '  com',
        },
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/completion',
      params: {
        textDocument: { uri },
        position: { line: 0, character: 5 },
      },
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 3, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));

  const messages = output.map(decodeFrame);
  const initializeResponse = messages.find(({ id }) => id === 1);
  const completionResponse = messages.find(({ id }) => id === 2);
  const shutdownResponse = messages.find(({ id }) => id === 3);

  assert.deepEqual(initializeResponse.result.capabilities.completionProvider, {
    resolveProvider: false,
  });
  assert.deepEqual(completionResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: [
      {
        label: 'component',
        kind: 14,
        detail: 'PlantUML declaration keyword',
        sortText: '017',
        filterText: 'component',
        insertTextFormat: 1,
        textEdit: {
          range: {
            start: { line: 0, character: 2 },
            end: { line: 0, character: 5 },
          },
          newText: 'component',
        },
      },
    ],
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 3, result: null });
});
