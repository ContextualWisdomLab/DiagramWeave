import { Buffer } from 'node:buffer';

import { LanguageServerStdioError } from './errors.js';
import { languageServerStdioLimits } from './limits.js';

const byteLengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
).get;
const headerDelimiter = Buffer.from('\r\n\r\n', 'ascii');
const contentTypePattern = /^application\/vscode-jsonrpc(?:\s*;\s*charset\s*=\s*(?:utf-8|utf8))?$/iu;
const headerNamePattern = /^[A-Za-z0-9-]+$/u;
const headerValuePattern = /^[\t\x20-\x7e]*$/u;

/**
 * Create one fatal framing error that maps to JSON-RPC parse error.
 *
 * @param {string} code - Stable transport code.
 * @param {string} message - Fixed source-free message.
 * @returns {LanguageServerStdioError} Fatal framing error.
 */
function framingError(code, message) {
  return new LanguageServerStdioError(code, message, {
    fatal: true,
    jsonRpcCode: -32700,
    responseId: null,
  });
}

/**
 * Return the intrinsic byte length of a Uint8Array without trusting an override.
 *
 * @param {unknown} value - Candidate byte chunk.
 * @returns {number} Intrinsic byte length.
 */
function intrinsicByteLength(value) {
  if (!(value instanceof Uint8Array)) {
    throw framingError('invalid_chunk', 'The transport chunk must contain bytes.');
  }
  try {
    return byteLengthGetter.call(value);
  } catch {
    throw framingError('invalid_chunk', 'The transport chunk could not be read.');
  }
}

/**
 * Parse one complete ASCII LSP header block into its bounded content length.
 *
 * @param {Buffer} headerBytes - Header bytes without the final delimiter.
 * @returns {number} Valid body byte length.
 */
function parseHeaderBlock(headerBytes) {
  if (headerBytes.length === 0) {
    throw framingError('content_length_required', 'Content-Length is required.');
  }
  for (const byte of headerBytes) {
    if (byte > 0x7f) {
      throw framingError('invalid_header', 'The transport header must be ASCII.');
    }
  }
  const lines = headerBytes.toString('ascii').split('\r\n');
  let contentLength = null;
  let contentTypeSeen = false;
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      throw framingError('invalid_header', 'The transport header is malformed.');
    }
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();
    if (!headerNamePattern.test(name) || !headerValuePattern.test(value)) {
      throw framingError('invalid_header', 'The transport header is malformed.');
    }
    const normalizedName = name.toLowerCase();
    if (normalizedName === 'content-length') {
      if (contentLength !== null || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
        throw framingError('invalid_content_length', 'Content-Length is invalid.');
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed > languageServerStdioLimits.maxMessageBytes) {
        throw framingError('message_too_large', 'The JSON-RPC message exceeds the transport limit.');
      }
      contentLength = parsed;
      continue;
    }
    if (normalizedName === 'content-type') {
      if (contentTypeSeen || !contentTypePattern.test(value)) {
        throw framingError('content_type_unsupported', 'The JSON-RPC content type is unsupported.');
      }
      contentTypeSeen = true;
      continue;
    }
    throw framingError('header_unsupported', 'The transport header is unsupported.');
  }
  if (contentLength === null) {
    throw framingError('content_length_required', 'Content-Length is required.');
  }
  return contentLength;
}

/**
 * Create a bounded incremental LSP Content-Length frame reader.
 *
 * The reader accepts arbitrary byte chunks, emits copied body buffers, and
 * retains at most one incomplete bounded frame. Any malformed header, oversized
 * body, hostile byte object, excessive chunk, or message flood poisons the
 * reader and fails closed.
 *
 * @returns {Readonly<{
 *   push(chunk: unknown): readonly Buffer[],
 *   finish(): void,
 * }>} Frozen frame-reader API.
 */
export function createLspFrameReader() {
  let buffered = Buffer.alloc(0);
  let poisoned = false;

  const reader = {
    /**
     * Accept one transport byte chunk and return every complete frame body.
     *
     * @param {unknown} chunk - Uint8Array-compatible bytes.
     * @returns {readonly Buffer[]} Frozen copied message bodies.
     */
    push(chunk) {
      if (poisoned) {
        throw framingError('reader_closed', 'The frame reader is closed.');
      }
      try {
        const byteLength = intrinsicByteLength(chunk);
        if (byteLength > languageServerStdioLimits.maxChunkBytes) {
          throw framingError('chunk_too_large', 'The transport chunk exceeds the limit.');
        }
        const incoming = Buffer.from(chunk.buffer, chunk.byteOffset, byteLength);
        let combined = buffered.length === 0
          ? Buffer.from(incoming)
          : Buffer.concat([buffered, incoming]);
        const frames = [];
        while (combined.length > 0) {
          const headerEnd = combined.indexOf(headerDelimiter);
          if (headerEnd === -1) {
            if (combined.length > languageServerStdioLimits.maxHeaderBytes) {
              throw framingError('header_too_large', 'The transport header exceeds the limit.');
            }
            break;
          }
          if (headerEnd > languageServerStdioLimits.maxHeaderBytes) {
            throw framingError('header_too_large', 'The transport header exceeds the limit.');
          }
          const contentLength = parseHeaderBlock(combined.subarray(0, headerEnd));
          const bodyStart = headerEnd + headerDelimiter.length;
          const frameEnd = bodyStart + contentLength;
          if (combined.length < frameEnd) {
            break;
          }
          frames.push(Buffer.from(combined.subarray(bodyStart, frameEnd)));
          if (frames.length > languageServerStdioLimits.maxPendingMessages) {
            throw framingError('message_flood', 'Too many JSON-RPC messages arrived in one chunk.');
          }
          combined = combined.subarray(frameEnd);
        }
        buffered = Buffer.from(combined);
        return Object.freeze(frames);
      } catch (error) {
        poisoned = true;
        buffered = Buffer.alloc(0);
        throw error instanceof LanguageServerStdioError
          ? error
          : framingError('invalid_chunk', 'The transport chunk could not be processed.');
      }
    },

    /**
     * Finish the byte stream and reject a truncated header or message body.
     *
     * @returns {void}
     */
    finish() {
      if (poisoned) {
        throw framingError('reader_closed', 'The frame reader is closed.');
      }
      if (buffered.length !== 0) {
        poisoned = true;
        buffered = Buffer.alloc(0);
        throw framingError('unexpected_eof', 'The transport stream ended inside a frame.');
      }
      poisoned = true;
    },
  };
  return Object.freeze(reader);
}
