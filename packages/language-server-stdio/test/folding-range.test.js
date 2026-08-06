import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/folding.puml';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

async function messagesForInitializeParams(initializeParams) {
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
          text: [
            'package Platform {',
            '  namespace api {',
            '    class Gateway',
            '  }',
            '  class Worker',
            '}',
          ].join('\n'),
        },
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/foldingRange',
      params: { textDocument: { uri } },
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 3, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));

  return output.map(decodeFrame);
}

test('serves conservative folding ranges through the real bounded stdio transport', async () => {
  const messages = await messagesForInitializeParams({
    capabilities: {
      textDocument: {
        foldingRange: {
          rangeLimit: 2,
          lineFoldingOnly: true,
        },
      },
    },
  });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const foldingResponse = messages.find(({ id }) => id === 2);
  const shutdownResponse = messages.find(({ id }) => id === 3);
  const diagnosticsNotification = messages.find(
    ({ method }) => method === 'textDocument/publishDiagnostics',
  );

  assert.equal(initializeResponse.result.capabilities.foldingRangeProvider, true);
  assert.deepEqual(foldingResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: [
      { startLine: 0, endLine: 5 },
      { startLine: 1, endLine: 3 },
    ],
  });
  assert.deepEqual(diagnosticsNotification, {
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, version: 1, diagnostics: [] },
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 3, result: null });
});

test('returns fixed method-not-found to clients that did not negotiate folding', async () => {
  const messages = await messagesForInitializeParams({ capabilities: {} });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const foldingResponse = messages.find(({ id }) => id === 2);

  assert.equal(initializeResponse.result.capabilities.foldingRangeProvider, undefined);
  assert.deepEqual(foldingResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32601,
      message: 'Method not found.',
      data: { diagramweaveCode: 'method_not_found' },
    },
  });
});
