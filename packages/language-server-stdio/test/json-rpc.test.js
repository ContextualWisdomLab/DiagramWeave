import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '@contextualwisdomlab/diagramweave-language-server';

import { LanguageServerStdioError } from '../src/errors.js';
import {
  createErrorResponse,
  createSuccessResponse,
  encodeJsonRpcFrame,
  parseJsonRpcClientMessage,
  responseForProtocolError,
  responseForSessionError,
} from '../src/json-rpc.js';
import { languageServerStdioLimits } from '../src/limits.js';

function body(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
}

function assertProtocol(error, code, jsonRpcCode) {
  assert.equal(error instanceof LanguageServerStdioError, true);
  assert.equal(error.code, code);
  assert.equal(error.jsonRpcCode, jsonRpcCode);
  return true;
}

function decodeFrame(frame) {
  const separator = frame.indexOf('\r\n\r\n');
  const header = frame.subarray(0, separator).toString('ascii');
  const messageBody = frame.subarray(separator + 4);
  assert.equal(header, `Content-Length: ${messageBody.length}`);
  return JSON.parse(messageBody.toString('utf8'));
}

test('parses bounded JSON-RPC requests and notifications', () => {
  const messages = [
    [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, {
      kind: 'request', id: 1, method: 'initialize', params: {},
    }],
    [{ jsonrpc: '2.0', id: 'request-1', method: 'shutdown' }, {
      kind: 'request', id: 'request-1', method: 'shutdown', params: null,
    }],
    [{ jsonrpc: '2.0', method: 'initialized', params: null }, {
      kind: 'notification', id: null, method: 'initialized', params: null,
    }],
    [{ jsonrpc: '2.0', method: 'workspace/test', params: [] }, {
      kind: 'notification', id: null, method: 'workspace/test', params: [],
    }],
  ];
  for (const [input, expected] of messages) {
    const parsed = parseJsonRpcClientMessage(body(input));
    assert.deepEqual(parsed, expected);
    assert.equal(Object.isFrozen(parsed), true);
  }
});

test('rejects malformed UTF-8, JSON, request shapes, methods, params, and identifiers', () => {
  const oversizedMethod = 'm'.repeat(languageServerStdioLimits.maxMethodBytes + 1);
  const oversizedId = 'i'.repeat(languageServerStdioLimits.maxStringIdBytes + 1);
  const invalidBodies = [
    [null, 'parse_error', -32700],
    [Buffer.from([0xff]), 'parse_error', -32700],
    [body('{'), 'parse_error', -32700],
    [body([]), 'invalid_request', -32600],
    [body(null), 'invalid_request', -32600],
    [body({ jsonrpc: '1.0', method: 'x' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', method: 'x', extra: true }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', method: '' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', method: 'bad\u0000method' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', method: oversizedMethod }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', method: 'x', params: 1 }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', id: null, method: 'x' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', id: 1.5, method: 'x' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', id: Number.MAX_SAFE_INTEGER + 1, method: 'x' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', id: '', method: 'x' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', id: 'bad\u0000id', method: 'x' }), 'invalid_request', -32600],
    [body({ jsonrpc: '2.0', id: oversizedId, method: 'x' }), 'invalid_request', -32600],
  ];
  for (const [value, code, jsonRpcCode] of invalidBodies) {
    assert.throws(
      () => parseJsonRpcClientMessage(value),
      (error) => assertProtocol(error, code, jsonRpcCode),
    );
  }
});

test('enforces intrinsic body length and maximum message bytes', () => {
  const oversized = new Uint8Array(languageServerStdioLimits.maxMessageBytes + 1);
  assert.throws(
    () => parseJsonRpcClientMessage(oversized),
    (error) => assertProtocol(error, 'message_too_large', -32700),
  );
  const revoked = Proxy.revocable(new Uint8Array([1]), {});
  revoked.revoke();
  assert.throws(
    () => parseJsonRpcClientMessage(revoked.proxy),
    (error) => assertProtocol(error, 'parse_error', -32700),
  );
});

test('creates deterministic success and source-free error responses', () => {
  assert.deepEqual(createSuccessResponse(1, null), { jsonrpc: '2.0', id: 1, result: null });
  assert.deepEqual(createErrorResponse(null, -32700, 'Parse error.'), {
    jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' },
  });
  assert.deepEqual(createErrorResponse('x', -32602, 'Invalid params.', 'invalid_request'), {
    jsonrpc: '2.0',
    id: 'x',
    error: {
      code: -32602,
      message: 'Invalid params.',
      data: { diagramweaveCode: 'invalid_request' },
    },
  });
});

test('maps every Language Server error family to fixed JSON-RPC codes', () => {
  const cases = [
    ['method_not_found', -32601, 'Method not found.'],
    ['server_not_initialized', -32002, 'Server not initialized.'],
    ['invalid_request', -32602, 'Invalid params.'],
    ['document_uri_invalid', -32602, 'Invalid params.'],
    ['document_version_invalid', -32602, 'Invalid params.'],
    ['document_text_invalid', -32602, 'Invalid params.'],
    ['document_too_large', -32602, 'Invalid params.'],
    ['document_language_unsupported', -32602, 'Invalid params.'],
    ['document_already_open', -32602, 'Invalid params.'],
    ['too_many_documents', -32602, 'Invalid params.'],
    ['incremental_change_unsupported', -32602, 'Invalid params.'],
    ['document_not_open', -32602, 'Invalid params.'],
    ['document_version_out_of_order', -32602, 'Invalid params.'],
    ['server_shutting_down', -32000, 'Server error.'],
  ];
  for (const [code, expectedCode, message] of cases) {
    const response = responseForSessionError(7, new LanguageServerError(code, 'secret'));
    assert.equal(response.error.code, expectedCode);
    assert.equal(response.error.message, message);
    assert.equal(response.error.data.diagramweaveCode, code);
    assert.equal(JSON.stringify(response).includes('secret'), false);
  }
  assert.equal(responseForSessionError(1, new Error('secret')).error.code, -32603);
});

test('maps protocol errors and unknown failures without dynamic content', () => {
  const parse = responseForProtocolError(new LanguageServerStdioError('parse_error', 'secret', {
    jsonRpcCode: -32700,
    responseId: null,
  }));
  assert.deepEqual(parse, {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32700,
      message: 'Parse error.',
      data: { diagramweaveCode: 'parse_error' },
    },
  });
  const invalid = responseForProtocolError(new LanguageServerStdioError('invalid_request', 'secret', {
    jsonRpcCode: -32600,
    responseId: 'request',
  }));
  assert.equal(invalid.id, 'request');
  assert.equal(invalid.error.message, 'Invalid Request.');
  assert.equal(responseForProtocolError(new Error('secret')).error.code, -32603);
});

test('encodes bounded Content-Length frames and rejects unsafe output values', () => {
  const message = createSuccessResponse('id', { ok: true });
  assert.deepEqual(decodeFrame(encodeJsonRpcFrame(message)), message);

  const circular = {};
  circular.self = circular;
  assert.throws(
    () => encodeJsonRpcFrame(circular),
    (error) => error instanceof LanguageServerStdioError && error.code === 'output_encoding_failed',
  );
  const oversized = { value: 'x'.repeat(languageServerStdioLimits.maxMessageBytes) };
  assert.throws(
    () => encodeJsonRpcFrame(oversized),
    (error) => error instanceof LanguageServerStdioError && error.code === 'output_message_too_large',
  );
});
