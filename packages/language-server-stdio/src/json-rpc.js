import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';

import { LanguageServerError } from '@contextualwisdomlab/diagramweave-language-server';

import { LanguageServerStdioError } from './errors.js';
import { languageServerStdioLimits } from './limits.js';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const controlCharacters = /[\u0000-\u001f\u007f]/u;
const allowedKeys = new Set(['jsonrpc', 'id', 'method', 'params']);
const byteLengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
).get;

/**
 * Create one protocol error that can be serialized as a JSON-RPC error response.
 *
 * @param {string} code - Stable transport code.
 * @param {string} message - Fixed source-free message.
 * @param {number} jsonRpcCode - Standard JSON-RPC error code.
 * @returns {LanguageServerStdioError} Protocol error.
 */
function protocolError(code, message, jsonRpcCode) {
  return new LanguageServerStdioError(code, message, {
    jsonRpcCode,
    responseId: null,
  });
}

/**
 * Return whether one parsed JSON value is a plain object.
 *
 * @param {unknown} value - Candidate record.
 * @returns {boolean} True only for Object-prototype records.
 */
function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Normalize one JSON-RPC request identifier.
 *
 * @param {unknown} value - Candidate identifier.
 * @returns {string|number} Supported request identifier.
 */
function normalizeId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    !controlCharacters.test(value) &&
    Buffer.byteLength(value, 'utf8') <= languageServerStdioLimits.maxStringIdBytes
  ) {
    return value;
  }
  throw protocolError('invalid_request', 'The JSON-RPC request is invalid.', -32600);
}

/**
 * Normalize one bounded JSON-RPC method name.
 *
 * @param {unknown} value - Candidate method.
 * @returns {string} Supported method string.
 */
function normalizeMethod(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    controlCharacters.test(value) ||
    Buffer.byteLength(value, 'utf8') > languageServerStdioLimits.maxMethodBytes
  ) {
    throw protocolError('invalid_request', 'The JSON-RPC request is invalid.', -32600);
  }
  return value;
}

/**
 * Parse one bounded UTF-8 JSON-RPC 2.0 request or notification body.
 *
 * Batch messages, responses, null IDs, fractional IDs, scalar params, unknown
 * members, malformed UTF-8, and malformed JSON fail closed. Returned objects
 * retain only fresh JSON-parsed data and freeze their top-level contract.
 *
 * @param {unknown} body - Message body bytes from the frame reader.
 * @returns {Readonly<{kind: 'request'|'notification', id: string|number|null, method: string, params: object|readonly unknown[]|null}>} Parsed client message.
 */
export function parseJsonRpcClientMessage(body) {
  let byteLength;
  try {
    if (!(body instanceof Uint8Array)) {
      throw new Error('not bytes');
    }
    byteLength = byteLengthGetter.call(body);
  } catch {
    throw protocolError('parse_error', 'The JSON-RPC message could not be parsed.', -32700);
  }
  if (byteLength > languageServerStdioLimits.maxMessageBytes) {
    throw protocolError('message_too_large', 'The JSON-RPC message exceeds the transport limit.', -32700);
  }

  let text;
  let parsed;
  try {
    text = utf8Decoder.decode(body);
    parsed = JSON.parse(text);
  } catch {
    throw protocolError('parse_error', 'The JSON-RPC message could not be parsed.', -32700);
  }
  if (!isJsonObject(parsed)) {
    throw protocolError('invalid_request', 'The JSON-RPC request is invalid.', -32600);
  }
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      throw protocolError('invalid_request', 'The JSON-RPC request is invalid.', -32600);
    }
  }
  if (parsed.jsonrpc !== '2.0' || !Object.hasOwn(parsed, 'method')) {
    throw protocolError('invalid_request', 'The JSON-RPC request is invalid.', -32600);
  }
  const method = normalizeMethod(parsed.method);
  let params = null;
  if (Object.hasOwn(parsed, 'params')) {
    params = parsed.params;
    if (params !== null && !Array.isArray(params) && !isJsonObject(params)) {
      throw protocolError('invalid_request', 'The JSON-RPC request is invalid.', -32600);
    }
  }
  if (Object.hasOwn(parsed, 'id')) {
    return Object.freeze({
      kind: 'request',
      id: normalizeId(parsed.id),
      method,
      params,
    });
  }
  return Object.freeze({
    kind: 'notification',
    id: null,
    method,
    params,
  });
}

/**
 * Create one frozen JSON-RPC success response.
 *
 * @param {string|number} id - Request identifier.
 * @param {unknown} result - Language Server result.
 * @returns {Readonly<object>} Success response.
 */
export function createSuccessResponse(id, result) {
  return Object.freeze({ jsonrpc: '2.0', id, result });
}

/**
 * Create one frozen source-free JSON-RPC error response.
 *
 * @param {string|number|null} id - Request identifier or null.
 * @param {number} code - JSON-RPC error code.
 * @param {string} message - Fixed protocol message.
 * @param {string|null} diagramweaveCode - Optional stable internal code.
 * @returns {Readonly<object>} Error response.
 */
export function createErrorResponse(id, code, message, diagramweaveCode = null) {
  const error = diagramweaveCode === null
    ? Object.freeze({ code, message })
    : Object.freeze({
      code,
      message,
      data: Object.freeze({ diagramweaveCode }),
    });
  return Object.freeze({ jsonrpc: '2.0', id, error });
}

/**
 * Map one Language Server rejection to a fixed JSON-RPC error response.
 *
 * @param {string|number} id - Request identifier.
 * @param {unknown} error - Session rejection.
 * @returns {Readonly<object>} Source-free error response.
 */
export function responseForSessionError(id, error) {
  if (!(error instanceof LanguageServerError)) {
    return createErrorResponse(id, -32603, 'Internal error.', 'internal_error');
  }
  if (error.code === 'method_not_found') {
    return createErrorResponse(id, -32601, 'Method not found.', error.code);
  }
  if (error.code === 'server_not_initialized') {
    return createErrorResponse(id, -32002, 'Server not initialized.', error.code);
  }
  const invalidParamCodes = new Set([
    'invalid_request',
    'document_uri_invalid',
    'document_version_invalid',
    'document_text_invalid',
    'document_too_large',
    'document_language_unsupported',
    'document_already_open',
    'too_many_documents',
    'incremental_change_unsupported',
    'document_not_open',
    'document_version_out_of_order',
    'document_position_invalid',
  ]);
  if (invalidParamCodes.has(error.code)) {
    return createErrorResponse(id, -32602, 'Invalid params.', error.code);
  }
  return createErrorResponse(id, -32000, 'Server error.', error.code);
}

/**
 * Convert one transport protocol failure to a JSON-RPC response.
 *
 * @param {unknown} error - Protocol or framing error.
 * @returns {Readonly<object>} Source-free JSON-RPC error response.
 */
export function responseForProtocolError(error) {
  if (
    error instanceof LanguageServerStdioError &&
    typeof error.jsonRpcCode === 'number'
  ) {
    const message = error.jsonRpcCode === -32700 ? 'Parse error.' : 'Invalid Request.';
    return createErrorResponse(error.responseId ?? null, error.jsonRpcCode, message, error.code);
  }
  return createErrorResponse(null, -32603, 'Internal error.', 'internal_error');
}

/**
 * Encode one internal JSON-RPC message as a bounded LSP Content-Length frame.
 *
 * @param {unknown} message - Internal response or notification record.
 * @returns {Buffer} Complete framed UTF-8 message.
 */
export function encodeJsonRpcFrame(message) {
  let body;
  try {
    body = Buffer.from(JSON.stringify(message), 'utf8');
  } catch {
    throw new LanguageServerStdioError(
      'output_encoding_failed',
      'The JSON-RPC output could not be encoded.',
      { fatal: true },
    );
  }
  if (body.length > languageServerStdioLimits.maxMessageBytes) {
    throw new LanguageServerStdioError(
      'output_message_too_large',
      'The JSON-RPC output exceeds the transport limit.',
      { fatal: true },
    );
  }
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
  return Buffer.concat([header, body]);
}
