import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/definition.puml';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

async function messagesForInitializeParams(
  initializeParams,
  definitionPosition = { line: 2, character: 16 },
) {
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
            'class "Order Service" as OrderService',
            'class Customer',
            'Customer --> OrderService : submits',
          ].join('\n'),
        },
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/definition',
      params: {
        textDocument: { uri },
        position: definitionPosition,
      },
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 3, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));

  return output.map(decodeFrame);
}

test('serves definition through the real bounded stdio transport', async () => {
  const messages = await messagesForInitializeParams({
    capabilities: {
      textDocument: {
        definition: {},
      },
    },
  });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const definitionResponse = messages.find(({ id }) => id === 2);
  const shutdownResponse = messages.find(({ id }) => id === 3);

  assert.equal(initializeResponse.result.capabilities.definitionProvider, true);
  assert.deepEqual(definitionResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: {
      uri,
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 20 },
      },
    },
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 3, result: null });
});

test('returns fixed method-not-found when definition was not negotiated', async () => {
  const messages = await messagesForInitializeParams({ capabilities: {} });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const definitionResponse = messages.find(({ id }) => id === 2);

  assert.equal(initializeResponse.result.capabilities.definitionProvider, undefined);
  assert.deepEqual(definitionResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32601,
      message: 'Method not found.',
      data: { diagramweaveCode: 'method_not_found' },
    },
  });
});

test('maps invalid definition positions to fixed invalid-params responses', async () => {
  const messages = await messagesForInitializeParams(
    {
      capabilities: {
        textDocument: {
          definition: {},
        },
      },
    },
    { line: 99, character: 0 },
  );
  const definitionResponse = messages.find(({ id }) => id === 2);

  assert.deepEqual(definitionResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32602,
      message: 'Invalid params.',
      data: { diagramweaveCode: 'document_position_invalid' },
    },
  });
  assert.equal(JSON.stringify(definitionResponse).includes(uri), false);
});
