import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanguageServerStdioConnection } from '../src/connection.js';
import { encodeJsonRpcFrame } from '../src/json-rpc.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/references.puml';
const source = [
  '@startuml',
  'class "Order Service" as OrderService',
  'actor Customer',
  'Customer --> OrderService : submits',
  'OrderService : submit()',
  '@enduml',
  '',
].join('\n');

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  return JSON.parse(frame.subarray(separator + 4).toString('utf8'));
}

async function messagesForReferenceRequest(
  textDocumentCapabilities,
  referenceParams = {
    textDocument: { uri },
    position: { line: 3, character: 15 },
    context: { includeDeclaration: true },
  },
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
      params: {
        capabilities: {
          textDocument: textDocumentCapabilities,
        },
      },
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
          text: source,
        },
      },
    }),
    encodeJsonRpcFrame({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/references',
      params: referenceParams,
    }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', id: 3, method: 'shutdown' }),
    encodeJsonRpcFrame({ jsonrpc: '2.0', method: 'exit' }),
  ]));

  return output.map(decodeFrame);
}

test('serves conservative references through the real bounded stdio transport', async () => {
  const messages = await messagesForReferenceRequest({ references: {} });
  const initializeResponse = messages.find(({ id }) => id === 1);
  const referenceResponse = messages.find(({ id }) => id === 2);
  const shutdownResponse = messages.find(({ id }) => id === 3);

  assert.equal(initializeResponse.result.capabilities.referencesProvider, true);
  assert.deepEqual(referenceResponse, {
    jsonrpc: '2.0',
    id: 2,
    result: [
      {
        uri,
        range: {
          start: { line: 1, character: 7 },
          end: { line: 1, character: 20 },
        },
      },
      {
        uri,
        range: {
          start: { line: 3, character: 13 },
          end: { line: 3, character: 25 },
        },
      },
      {
        uri,
        range: {
          start: { line: 4, character: 0 },
          end: { line: 4, character: 12 },
        },
      },
    ],
  });
  assert.deepEqual(shutdownResponse, { jsonrpc: '2.0', id: 3, result: null });
});

test('returns fixed method-not-found when references were not negotiated', async () => {
  const messages = await messagesForReferenceRequest({});
  const initializeResponse = messages.find(({ id }) => id === 1);
  const referenceResponse = messages.find(({ id }) => id === 2);

  assert.equal(initializeResponse.result.capabilities.referencesProvider, undefined);
  assert.deepEqual(referenceResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32601,
      message: 'Method not found.',
      data: { diagramweaveCode: 'method_not_found' },
    },
  });
});

test('maps invalid reference context to a fixed source-free invalid-params response', async () => {
  const messages = await messagesForReferenceRequest(
    { references: {} },
    {
      textDocument: { uri },
      position: { line: 3, character: 15 },
      context: { includeDeclaration: 'yes' },
    },
  );
  const referenceResponse = messages.find(({ id }) => id === 2);

  assert.deepEqual(referenceResponse, {
    jsonrpc: '2.0',
    id: 2,
    error: {
      code: -32602,
      message: 'Invalid params.',
      data: { diagramweaveCode: 'invalid_request' },
    },
  });
  assert.equal(JSON.stringify(referenceResponse).includes(uri), false);
  assert.equal(JSON.stringify(referenceResponse).includes(source), false);
});
