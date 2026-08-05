import {
  createLanguageServerSession,
} from '@contextualwisdomlab/diagramweave-language-server';

import { LanguageServerStdioError } from './errors.js';
import { createLspFrameReader } from './framing.js';
import {
  createSuccessResponse,
  encodeJsonRpcFrame,
  parseJsonRpcClientMessage,
  responseForProtocolError,
  responseForSessionError,
} from './json-rpc.js';
import { languageServerStdioLimits } from './limits.js';

/**
 * Return whether a value is a plain host options record.
 *
 * @param {unknown} value - Candidate record.
 * @returns {boolean} True only for Object- or null-prototype records.
 */
function isPlainRecord(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/**
 * Create one fixed source-free notification for a rejected client notification.
 *
 * @returns {Readonly<object>} JSON-RPC notification.
 */
function rejectedNotificationLog() {
  return Object.freeze({
    jsonrpc: '2.0',
    method: 'window/logMessage',
    params: Object.freeze({
      type: 1,
      message: 'DiagramWeave rejected a client notification.',
    }),
  });
}

/**
 * Normalize connection options and construct one Language Server session.
 *
 * @param {unknown} options - Candidate connection options.
 * @returns {Readonly<object>} Runtime boundaries.
 */
function normalizeOptions(options) {
  if (!isPlainRecord(options)) {
    throw new LanguageServerStdioError(
      'invalid_options',
      'Connection options must be a plain object.',
      { fatal: true },
    );
  }
  let writeBytes;
  let onExit;
  let sessionFactory;
  let javaPath;
  let jarPath;
  let rendererFactory;
  try {
    writeBytes = options.writeBytes;
    onExit = options.onExit ?? (() => undefined);
    sessionFactory = options.sessionFactory ?? createLanguageServerSession;
    javaPath = options.javaPath;
    jarPath = options.jarPath;
    rendererFactory = options.rendererFactory;
  } catch {
    throw new LanguageServerStdioError(
      'invalid_options',
      'Connection options could not be read.',
      { fatal: true },
    );
  }
  if (typeof writeBytes !== 'function' || typeof onExit !== 'function' || typeof sessionFactory !== 'function') {
    throw new LanguageServerStdioError(
      'invalid_options',
      'Connection callbacks must be callable.',
      { fatal: true },
    );
  }
  return Object.freeze({
    writeBytes,
    onExit,
    sessionFactory,
    javaPath,
    jarPath,
    rendererFactory,
  });
}

/**
 * Create one bounded sequential JSON-RPC connection around the Language Server session.
 *
 * Incoming chunks and messages are processed in order. Framing or JSON parse
 * failures emit one standard error response, dispose the session, and close the
 * connection. Request failures return source-free JSON-RPC errors. Notification
 * failures return no response and emit only a fixed log notification. Output is
 * serialized through the host's async `writeBytes` callback.
 *
 * @param {unknown} options - Renderer configuration, byte sink, exit callback, and optional test seams.
 * @returns {Readonly<{
 *   acceptChunk(chunk: unknown): Promise<void>,
 *   end(): Promise<void>,
 *   abort(): void,
 * }>} Frozen connection API.
 */
export function createLanguageServerStdioConnection(options) {
  const runtime = normalizeOptions(options);
  const reader = createLspFrameReader();
  let closed = false;
  let shutdownSucceeded = false;
  let pendingOperations = 0;
  let tail = Promise.resolve();
  let session;

  /**
   * Report the process-style exit code exactly once and dispose the session.
   *
   * @param {number} code - Zero for graceful shutdown plus exit, otherwise one.
   * @returns {void}
   */
  function terminate(code) {
    if (closed) {
      return;
    }
    closed = true;
    try {
      session.dispose();
    } catch {
      // Disposal is best-effort and cannot expose a host or session failure.
    }
    try {
      runtime.onExit(code);
    } catch {
      // Exit observers are outside the protocol trust boundary.
    }
  }

  /**
   * Serialize one server message through the byte sink.
   *
   * @param {unknown} message - Internal JSON-RPC message.
   * @returns {Promise<void>}
   */
  async function send(message) {
    if (closed) {
      throw new LanguageServerStdioError('connection_closed', 'The connection is closed.', {
        fatal: true,
      });
    }
    const bytes = encodeJsonRpcFrame(message);
    try {
      await runtime.writeBytes(bytes);
    } catch {
      terminate(1);
      throw new LanguageServerStdioError(
        'output_failed',
        'The JSON-RPC output could not be written.',
        { fatal: true },
      );
    }
  }

  try {
    session = runtime.sessionFactory({
      javaPath: runtime.javaPath,
      jarPath: runtime.jarPath,
      rendererFactory: runtime.rendererFactory,
      publishNotification(method, params) {
        return send(Object.freeze({ jsonrpc: '2.0', method, params }));
      },
    });
    if (
      session === null ||
      typeof session !== 'object' ||
      typeof session.request !== 'function' ||
      typeof session.notify !== 'function' ||
      typeof session.dispose !== 'function'
    ) {
      throw new Error('invalid session');
    }
  } catch {
    throw new LanguageServerStdioError(
      'session_unavailable',
      'The Language Server session could not be created.',
      { fatal: true },
    );
  }

  /**
   * Dispatch one complete JSON-RPC body to the session.
   *
   * @param {Uint8Array} body - Complete message body.
   * @returns {Promise<void>}
   */
  async function dispatch(body) {
    let message;
    try {
      message = parseJsonRpcClientMessage(body);
    } catch (error) {
      await send(responseForProtocolError(error));
      terminate(1);
      throw error;
    }

    if (message.kind === 'request') {
      let result;
      try {
        result = await session.request(message.method, message.params);
      } catch (error) {
        await send(responseForSessionError(message.id, error));
        return;
      }
      if (message.method === 'shutdown') {
        shutdownSucceeded = true;
      }
      await send(createSuccessResponse(message.id, result));
      return;
    }

    try {
      await session.notify(message.method, message.params);
      if (message.method === 'exit') {
        terminate(shutdownSucceeded ? 0 : 1);
      }
    } catch {
      await send(rejectedNotificationLog());
    }
  }

  /**
   * Process one input chunk after earlier queued work.
   *
   * @param {unknown} chunk - Incoming bytes.
   * @returns {Promise<void>}
   */
  async function processChunk(chunk) {
    if (closed) {
      throw new LanguageServerStdioError('connection_closed', 'The connection is closed.', {
        fatal: true,
      });
    }
    let frames;
    try {
      frames = reader.push(chunk);
    } catch (error) {
      if (!closed) {
        try {
          await send(responseForProtocolError(error));
        } finally {
          terminate(1);
        }
      }
      throw error;
    }
    for (const frame of frames) {
      await dispatch(frame);
      if (closed) {
        break;
      }
    }
  }

  /**
   * Queue one connection operation and enforce a bounded pending-call count.
   *
   * @param {() => Promise<void>} operation - Deferred operation.
   * @returns {Promise<void>} Operation completion.
   */
  function enqueue(operation) {
    if (closed) {
      return Promise.reject(new LanguageServerStdioError(
        'connection_closed',
        'The connection is closed.',
        { fatal: true },
      ));
    }
    pendingOperations += 1;
    if (pendingOperations > languageServerStdioLimits.maxPendingMessages) {
      pendingOperations -= 1;
      terminate(1);
      return Promise.reject(new LanguageServerStdioError(
        'message_queue_overflow',
        'The JSON-RPC input queue exceeded the limit.',
        { fatal: true },
      ));
    }
    const result = tail.then(operation);
    tail = result.catch(() => undefined).finally(() => {
      pendingOperations -= 1;
    });
    return result;
  }

  const connection = {
    /**
     * Queue one incoming byte chunk.
     *
     * @param {unknown} chunk - Uint8Array-compatible bytes.
     * @returns {Promise<void>}
     */
    acceptChunk(chunk) {
      return enqueue(() => processChunk(chunk));
    },

    /**
     * Finish a clean or truncated input stream.
     *
     * Clean EOF without an LSP `exit` notification is still abnormal and
     * reports exit code one.
     *
     * @returns {Promise<void>}
     */
    end() {
      return enqueue(async () => {
        try {
          reader.finish();
        } catch (error) {
          try {
            await send(responseForProtocolError(error));
          } finally {
            terminate(1);
          }
          throw error;
        }
        terminate(1);
      });
    },

    /**
     * Abort the connection without writing more protocol output.
     *
     * @returns {void}
     */
    abort() {
      terminate(1);
    },
  };
  return Object.freeze(connection);
}
