import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/context.puml';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

test('serves document symbols through the real bounded stdio transport', async () => {
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
          text: '@startuml\npackage "Core" {\n  component API\n}\n@enduml\n',
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

  const messages = output.map(decodeFrame);
  const initializeResponse = messages.find(({ id }) => id === 1);
  const symbolResponse = messages.find(({ id }) => id === 2);
  const shutdownResponse = messages.find(({ id }) => id === 3);
  const diagnosticsNotification = messages.find(
    ({ method }) => method === 'textDocument/publishDiagnostics',
  );

  assert.equal(initializeResponse.result.capabilities.documentSymbolProvider, true);
  assert.deepEqual(diagnosticsNotification, {
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, version: 1, diagnostics: [] },
  });
  assert.deepEqual(symbolResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: [
      {
        name: 'Core',
        detail: 'package',
        kind: 4,
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 16 },
        },
        selectionRange: {
          start: { line: 1, character: 9 },
          end: { line: 1, character: 13 },
        },
      },
      {
        name: 'API',
        detail: 'component',
        kind: 2,
        range: {
          start: { line: 2, character: 2 },
          end: { line: 2, character: 15 },
        },
        selectionRange: {
          start: { line: 2, character: 12 },
          end: { line: 2, character: 15 },
        },
      },
    ],
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 3, result: null });
});
