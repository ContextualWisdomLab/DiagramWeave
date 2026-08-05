import {
  createPlantUmlRenderer,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

import {
  isPlainRecord,
  normalizeDocumentText,
  normalizeDocumentUri,
  normalizeDocumentVersion,
  normalizeLanguageId,
  normalizeRendererPath,
  requireSafeString,
} from './contracts.js';
import { diagnosticsForRendererOutcome } from './diagnostics.js';
import { LanguageServerError } from './errors.js';
import { languageServerLimits } from './limits.js';

/**
 * Freeze one notification parameter record and its diagnostics collection.
 *
 * @param {string} uri - Validated document URI.
 * @param {number} version - Current document version.
 * @param {readonly object[]} diagnostics - Frozen diagnostics.
 * @returns {Readonly<object>} Deeply frozen publish-diagnostics parameters.
 */
function publishParameters(uri, version, diagnostics) {
  return Object.freeze({ uri, version, diagnostics });
}

/**
 * Create one fixed renderer log notification.
 *
 * @returns {Readonly<object>} Frozen source-free log message.
 */
function rendererLogMessage() {
  return Object.freeze({
    type: 1,
    message: 'DiagramWeave renderer validation failed.',
  });
}

/**
 * Normalize one session options record and construct the local renderer.
 *
 * @param {unknown} options - Candidate host options.
 * @returns {Readonly<object>} Frozen runtime dependencies.
 */
function normalizeOptions(options) {
  if (!isPlainRecord(options)) {
    throw new LanguageServerError('invalid_options', 'Session options must be a plain object.');
  }
  let rendererFactory;
  let publishNotification;
  try {
    rendererFactory = options.rendererFactory ?? createPlantUmlRenderer;
    publishNotification = options.publishNotification;
  } catch {
    throw new LanguageServerError('invalid_options', 'Session options could not be read.');
  }
  if (typeof rendererFactory !== 'function') {
    throw new LanguageServerError('invalid_options', 'rendererFactory must be callable.', {
      field: 'rendererFactory',
    });
  }
  if (typeof publishNotification !== 'function') {
    throw new LanguageServerError('invalid_options', 'publishNotification must be callable.', {
      field: 'publishNotification',
    });
  }
  let javaPath;
  let jarPath;
  try {
    javaPath = normalizeRendererPath(options.javaPath, 'javaPath');
    jarPath = normalizeRendererPath(options.jarPath, 'jarPath');
  } catch (error) {
    if (error instanceof LanguageServerError) {
      throw error;
    }
    throw new LanguageServerError('invalid_options', 'Renderer paths could not be read.');
  }
  let renderer;
  let render;
  try {
    renderer = rendererFactory({ javaPath, jarPath });
    if (renderer === null || typeof renderer !== 'object') {
      throw new Error('invalid renderer');
    }
    render = renderer.render;
  } catch {
    throw new LanguageServerError('renderer_unavailable', 'The renderer could not be created.');
  }
  if (typeof render !== 'function') {
    throw new LanguageServerError('renderer_unavailable', 'The renderer contract is invalid.');
  }
  return Object.freeze({
    publishNotification,
    render(request) {
      return Reflect.apply(render, renderer, [request]);
    },
  });
}

/**
 * Create the immutable LSP 3.18 initialize result for full-document synchronization.
 *
 * @returns {Readonly<object>} Deeply frozen server capability contract.
 */
function initializeResult() {
  return Object.freeze({
    capabilities: Object.freeze({
      positionEncoding: 'utf-16',
      textDocumentSync: Object.freeze({
        openClose: true,
        change: 1,
        save: false,
      }),
    }),
    serverInfo: Object.freeze({
      name: 'DiagramWeave Language Server',
      version: '0.0.0',
    }),
  });
}

/**
 * Create one mutable internal document record.
 *
 * @param {string} uri - Validated document URI.
 * @param {string} languageId - Supported language identifier.
 * @param {number} version - Initial version.
 * @param {string} text - Complete source text.
 * @returns {object} Internal document record.
 */
function documentRecord(uri, languageId, version, text) {
  return { uri, languageId, version, text, generation: 0 };
}

/**
 * Create a protocol-level DiagramWeave Language Server session.
 *
 * The session implements LSP request and notification semantics while leaving
 * JSON-RPC framing to a future transport adapter. It never reads or writes the
 * document URI; complete source snapshots are supplied by the client. Each
 * validation result is bound to the exact open-document version and generation,
 * so stale renderer completions are discarded after a change or close.
 *
 * @param {unknown} options - Renderer paths, optional factory, and notification sink.
 * @returns {Readonly<{
 *   request(method: unknown, params?: unknown): Promise<unknown>,
 *   notify(method: unknown, params?: unknown): Promise<void>,
 *   dispose(): void,
 * }>} Frozen session API.
 */
export function createLanguageServerSession(options) {
  const runtime = normalizeOptions(options);
  const documents = new Map();
  let initialized = false;
  let initializedNotificationReceived = false;
  let shutdownRequested = false;
  let exited = false;

  /**
   * Require an initialized active server for document notifications.
   *
   * @param {string} method - LSP method name.
   * @returns {void}
   */
  function requireActive(method) {
    if (!initialized) {
      throw new LanguageServerError(
        'server_not_initialized',
        'The Language Server has not been initialized.',
        { method },
      );
    }
    if (shutdownRequested || exited) {
      throw new LanguageServerError(
        'server_shutting_down',
        'The Language Server is shutting down.',
        { method },
      );
    }
  }

  /**
   * Require the post-initialize notification before document synchronization.
   *
   * @param {string} method - LSP method name.
   * @returns {void}
   */
  function requireReady(method) {
    requireActive(method);
    if (!initializedNotificationReceived) {
      throw new LanguageServerError(
        'server_not_ready',
        'The client has not completed Language Server initialization.',
        { method },
      );
    }
  }

  /**
   * Publish one LSP notification through the host boundary.
   *
   * @param {string} method - Notification method.
   * @param {Readonly<object>} params - Frozen notification parameters.
   * @returns {Promise<void>}
   */
  async function publish(method, params) {
    try {
      await runtime.publishNotification(method, params);
    } catch {
      throw new LanguageServerError(
        'notification_failed',
        'The host could not receive a Language Server notification.',
        { method },
      );
    }
  }

  /**
   * Validate one exact document generation and publish only if still current.
   *
   * @param {object} record - Current mutable document record.
   * @param {number} generation - Captured generation.
   * @returns {Promise<void>}
   */
  async function validate(record, generation) {
    let error = null;
    try {
      await runtime.render({ source: record.text, format: 'svg' });
    } catch (candidate) {
      error = candidate;
    }

    const current = documents.get(record.uri);
    if (
      exited ||
      shutdownRequested ||
      current !== record ||
      current.generation !== generation
    ) {
      return;
    }

    const diagnostics = diagnosticsForRendererOutcome(error);
    await publish(
      'textDocument/publishDiagnostics',
      publishParameters(record.uri, record.version, diagnostics),
    );
    if (error !== null && diagnostics[0]?.code === 'diagramweave.renderer') {
      await publish('window/logMessage', rendererLogMessage());
    }
  }

  /**
   * Normalize one didOpen notification.
   *
   * @param {unknown} params - Candidate notification parameters.
   * @returns {object} Mutable document record.
   */
  function openRecord(params) {
    let textDocument;
    try {
      if (!isPlainRecord(params)) {
        throw new Error('invalid record');
      }
      textDocument = params.textDocument;
      if (!isPlainRecord(textDocument)) {
        throw new Error('invalid text document');
      }
    } catch {
      throw new LanguageServerError('invalid_request', 'didOpen parameters are invalid.', {
        method: 'textDocument/didOpen',
      });
    }
    let uri;
    let languageId;
    let version;
    let text;
    try {
      uri = normalizeDocumentUri(textDocument.uri);
      languageId = normalizeLanguageId(textDocument.languageId);
      version = normalizeDocumentVersion(textDocument.version);
      text = normalizeDocumentText(textDocument.text);
    } catch (error) {
      if (error instanceof LanguageServerError) {
        throw error;
      }
      throw new LanguageServerError('invalid_request', 'didOpen parameters could not be read.');
    }
    if (documents.has(uri)) {
      throw new LanguageServerError('document_already_open', 'The document is already open.', {
        method: 'textDocument/didOpen',
      });
    }
    if (documents.size >= languageServerLimits.maxOpenDocuments) {
      throw new LanguageServerError('too_many_documents', 'The session document limit was reached.');
    }
    return documentRecord(uri, languageId, version, text);
  }

  /**
   * Normalize one didChange notification into a complete replacement snapshot.
   *
   * @param {unknown} params - Candidate notification parameters.
   * @returns {{record: object, version: number, text: string}} Normalized change.
   */
  function changeSnapshot(params) {
    let textDocument;
    let contentChange;
    try {
      if (!isPlainRecord(params)) {
        throw new Error('invalid record');
      }
      textDocument = params.textDocument;
      const contentChanges = params.contentChanges;
      if (
        !isPlainRecord(textDocument) ||
        !Array.isArray(contentChanges) ||
        contentChanges.length !== 1
      ) {
        throw new Error('invalid change collection');
      }
      contentChange = contentChanges[0];
      if (!isPlainRecord(contentChange)) {
        throw new Error('invalid change record');
      }
    } catch {
      throw new LanguageServerError('invalid_request', 'didChange parameters are invalid.', {
        method: 'textDocument/didChange',
      });
    }
    let uri;
    let version;
    let text;
    let range;
    let rangeLength;
    try {
      uri = normalizeDocumentUri(textDocument.uri);
      version = normalizeDocumentVersion(textDocument.version);
      text = normalizeDocumentText(contentChange.text);
      range = contentChange.range;
      rangeLength = contentChange.rangeLength;
    } catch (error) {
      if (error instanceof LanguageServerError) {
        throw error;
      }
      throw new LanguageServerError('invalid_request', 'didChange parameters could not be read.');
    }
    if (range !== undefined || rangeLength !== undefined) {
      throw new LanguageServerError(
        'incremental_change_unsupported',
        'The foundation accepts full-document changes only.',
        { method: 'textDocument/didChange' },
      );
    }
    const record = documents.get(uri);
    if (record === undefined) {
      throw new LanguageServerError('document_not_open', 'The document is not open.', {
        method: 'textDocument/didChange',
      });
    }
    if (version <= record.version) {
      throw new LanguageServerError(
        'document_version_out_of_order',
        'The document version must increase.',
        { method: 'textDocument/didChange' },
      );
    }
    return { record, version, text };
  }

  /**
   * Normalize one didClose notification URI.
   *
   * @param {unknown} params - Candidate notification parameters.
   * @returns {string} Validated open document URI.
   */
  function closeUri(params) {
    let textDocument;
    try {
      if (!isPlainRecord(params)) {
        throw new Error('invalid record');
      }
      textDocument = params.textDocument;
      if (!isPlainRecord(textDocument)) {
        throw new Error('invalid text document');
      }
    } catch {
      throw new LanguageServerError('invalid_request', 'didClose parameters are invalid.', {
        method: 'textDocument/didClose',
      });
    }
    let uri;
    try {
      uri = normalizeDocumentUri(textDocument.uri);
    } catch (error) {
      if (error instanceof LanguageServerError) {
        throw error;
      }
      throw new LanguageServerError('invalid_request', 'didClose parameters could not be read.');
    }
    if (!documents.has(uri)) {
      throw new LanguageServerError('document_not_open', 'The document is not open.', {
        method: 'textDocument/didClose',
      });
    }
    return uri;
  }

  const session = {
    /**
     * Handle one LSP request method without JSON-RPC framing.
     *
     * @param {unknown} method - Request method.
     * @param {unknown} [params] - Request parameters.
     * @returns {Promise<unknown>} Frozen result or null for shutdown.
     */
    async request(method, params = null) {
      const normalizedMethod = requireSafeString(method, 'method');
      if (normalizedMethod === 'initialize') {
        if (initialized || shutdownRequested || exited || (params !== null && !isPlainRecord(params))) {
          throw new LanguageServerError('invalid_request', 'initialize request is invalid.', {
            method: normalizedMethod,
          });
        }
        initialized = true;
        return initializeResult();
      }
      if (normalizedMethod === 'shutdown') {
        requireActive(normalizedMethod);
        shutdownRequested = true;
        documents.clear();
        return null;
      }
      throw new LanguageServerError('method_not_found', 'The request method is not supported.', {
        method: normalizedMethod,
      });
    },

    /**
     * Handle one LSP notification method without JSON-RPC framing.
     *
     * @param {unknown} method - Notification method.
     * @param {unknown} [params] - Notification parameters.
     * @returns {Promise<void>}
     */
    async notify(method, params = null) {
      const normalizedMethod = requireSafeString(method, 'method');
      if (normalizedMethod === 'exit') {
        exited = true;
        documents.clear();
        return;
      }
      if (normalizedMethod === 'initialized') {
        requireActive(normalizedMethod);
        if (initializedNotificationReceived || (params !== null && !isPlainRecord(params))) {
          throw new LanguageServerError('invalid_request', 'initialized notification is invalid.', {
            method: normalizedMethod,
          });
        }
        initializedNotificationReceived = true;
        return;
      }
      if (normalizedMethod === 'textDocument/didOpen') {
        requireReady(normalizedMethod);
        const record = openRecord(params);
        documents.set(record.uri, record);
        await validate(record, record.generation);
        return;
      }
      if (normalizedMethod === 'textDocument/didChange') {
        requireReady(normalizedMethod);
        const change = changeSnapshot(params);
        change.record.version = change.version;
        change.record.text = change.text;
        change.record.generation += 1;
        await validate(change.record, change.record.generation);
        return;
      }
      if (normalizedMethod === 'textDocument/didClose') {
        requireReady(normalizedMethod);
        const uri = closeUri(params);
        const record = documents.get(uri);
        documents.delete(uri);
        await publish(
          'textDocument/publishDiagnostics',
          publishParameters(uri, record.version, Object.freeze([])),
        );
        return;
      }
      // LSP requires unknown notifications to be ignored for forward compatibility.
    },

    /**
     * Dispose the session without publishing further notifications.
     *
     * @returns {void}
     */
    dispose() {
      exited = true;
      documents.clear();
    },
  };
  return Object.freeze(session);
}
