import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/hover.puml';

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

async function messagesForInitializeParams(initializeParams, hoverPosition = { line: 1, character: 9 }) {
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
            '  class Gateway',
            '}',
          ].join('\n'),
        },
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/hover',
      params: {
        textDocument: { uri },
        position: hoverPosition,
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 3,
      method: 'textDocument/hover',
      params: {
        textDocument: { uri },
        position: { line: 1, character: 15 },
      },
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 4, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));

  return output.map(decodeFrame);
}

test('serves declaration hover through the real bounded stdio transport', async () => {
  const messages = await messagesForInitializeParams({
    capabilities: {
      textDocument: {
        hover: { contentFormat: ['markdown', 'plaintext'] },
      },
    },
  });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const hoverResponse = messages.find(({ id }) => id === 2);
  const noMatchResponse = messages.find(({ id }) => id === 3);
  const shutdownResponse = messages.find(({ id }) => id === 4);
  const diagnosticsNotification = messages.find(
    ({ method }) => method === 'textDocument/publishDiagnostics',
  );

  assert.equal(initializeResponse.result.capabilities.hoverProvider, true);
  assert.deepEqual(hoverResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: {
      contents: {
        kind: 'markdown',
        value: [
          '```text',
          'PlantUML class declaration',
          'Name: Gateway',
          'Container: Platform',
          '```',
        ].join('\n'),
      },
      range: {
        start: { line: 1, character: 8 },
        end: { line: 1, character: 15 },
      },
    },
  });
  assert.deepEqual(noMatchResponse, { jsonrpc: '2.0', id: 3, result: null });
  assert.deepEqual(diagnosticsNotification, {
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, version: 1, diagnostics: [] },
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 4, result: null });
});

test('returns fixed method-not-found to clients that did not negotiate hover', async () => {
  const messages = await messagesForInitializeParams({ capabilities: {} });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const hoverResponse = messages.find(({ id }) => id === 2);

  assert.equal(initializeResponse.result.capabilities.hoverProvider, undefined);
  assert.deepEqual(hoverResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32601,
      message: 'Method not found.',
      data: { diagramweaveCode: 'method_not_found' },
    },
  });
});

test('maps invalid hover positions to fixed invalid-params responses', async () => {
  const messages = await messagesForInitializeParams(
    {
      capabilities: {
        textDocument: {
          hover: {},
        },
      },
    },
    { line: 99, character: 0 },
  );
  const hoverResponse = messages.find(({ id }) => id === 2);

  assert.deepEqual(hoverResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32602,
      message: 'Invalid params.',
      data: {
        diagramweaveCode: 'document_position_invalid',
      },
    },
  });
  assert.equal(JSON.stringify(hoverResponse).includes(uri), false);
});
