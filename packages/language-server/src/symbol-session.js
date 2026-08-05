import {
  isPlainRecord,
  normalizeDocumentText,
  normalizeDocumentUri,
  normalizeDocumentVersion,
  normalizeLanguageId,
} from './contracts.js';
import { LanguageServerError } from './errors.js';
import { createLanguageServerSession as createDiagnosticSession } from './session.js';
import { documentSymbolsForSource } from './symbols.js';

/**
 * Create an immutable initialize result that advertises document symbols.
 *
 * @param {Readonly<object>} result - Initialize result from the diagnostic session.
 * @returns {Readonly<object>} Deeply frozen initialize result.
 */
function advertiseDocumentSymbols(result) {
  return Object.freeze({
    ...result,
    capabilities: Object.freeze({
      ...result.capabilities,
      documentSymbolProvider: true,
    }),
  });
}

/**
 * Normalize one didOpen notification into an owned full-document snapshot.
 *
 * @param {unknown} params - Candidate notification parameters.
 * @returns {Readonly<object>} Frozen trusted notification parameters.
 */
function normalizeOpenParams(params) {
  let textDocument;
  try {
    if (!isPlainRecord(params)) {
      throw new Error('invalid parameters');
    }
    textDocument = params.textDocument;
    if (!isPlainRecord(textDocument)) {
      throw new Error('invalid text document');
    }
    return Object.freeze({
      textDocument: Object.freeze({
        uri: normalizeDocumentUri(textDocument.uri),
        languageId: normalizeLanguageId(textDocument.languageId),
        version: normalizeDocumentVersion(textDocument.version),
        text: normalizeDocumentText(textDocument.text),
      }),
    });
  } catch (error) {
    if (error instanceof LanguageServerError) {
      throw error;
    }
    throw new LanguageServerError('invalid_request', 'didOpen parameters are invalid.', {
      method: 'textDocument/didOpen',
    });
  }
}

/**
 * Normalize one full-document didChange notification into an owned snapshot.
 *
 * @param {unknown} params - Candidate notification parameters.
 * @returns {Readonly<object>} Frozen trusted notification parameters.
 */
function normalizeChangeParams(params) {
  let textDocument;
  let contentChanges;
  let contentChange;
  try {
    if (!isPlainRecord(params)) {
      throw new Error('invalid parameters');
    }
    textDocument = params.textDocument;
    contentChanges = params.contentChanges;
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
    const range = contentChange.range;
    const rangeLength = contentChange.rangeLength;
    if (range !== undefined || rangeLength !== undefined) {
      throw new LanguageServerError(
        'incremental_change_unsupported',
        'The foundation accepts full-document changes only.',
        { method: 'textDocument/didChange' },
      );
    }
    return Object.freeze({
      textDocument: Object.freeze({
        uri: normalizeDocumentUri(textDocument.uri),
        version: normalizeDocumentVersion(textDocument.version),
      }),
      contentChanges: Object.freeze([
        Object.freeze({ text: normalizeDocumentText(contentChange.text) }),
      ]),
    });
  } catch (error) {
    if (error instanceof LanguageServerError) {
      throw error;
    }
    throw new LanguageServerError('invalid_request', 'didChange parameters are invalid.', {
      method: 'textDocument/didChange',
    });
  }
}

/**
 * Normalize one didClose or document-symbol text-document identifier.
 *
 * @param {unknown} params - Candidate request or notification parameters.
 * @param {string} method - LSP method used in safe error metadata.
 * @returns {Readonly<object>} Frozen trusted parameters.
 */
function normalizeTextDocumentParams(params, method) {
  try {
    if (!isPlainRecord(params) || !isPlainRecord(params.textDocument)) {
      throw new Error('invalid parameters');
    }
    return Object.freeze({
      textDocument: Object.freeze({
        uri: normalizeDocumentUri(params.textDocument.uri),
      }),
    });
  } catch (error) {
    if (error instanceof LanguageServerError) {
      throw error;
    }
    throw new LanguageServerError('invalid_request', 'Text document parameters are invalid.', {
      method,
    });
  }
}

/**
 * Create a transport-neutral DiagramWeave Language Server with document symbols.
 *
 * The wrapper delegates lifecycle, validation, and diagnostics to the original
 * diagnostic session while owning only sanitized full-document snapshots used
 * by `textDocument/documentSymbol`. Concurrent mutations are tracked by epoch,
 * start sequence, active set, and last applied sequence. A rejected newer
 * mutation therefore cannot suppress an older valid completion, while an older
 * completion can never overwrite a newer successfully applied snapshot.
 *
 * @param {unknown} options - Diagnostic-session renderer and notification options.
 * @returns {Readonly<{
 *   request(method: unknown, params?: unknown): Promise<unknown>,
 *   notify(method: unknown, params?: unknown): Promise<void>,
 *   dispose(): void,
 * }>} Frozen document-symbol session API.
 */
export function createDocumentSymbolLanguageServerSession(options) {
  const diagnosticSession = createDiagnosticSession(options);
  const documents = new Map();
  const activeMutations = new Map();
  const lastAppliedSequence = new Map();
  let initialized = false;
  let ready = false;
  let shutdownRequested = false;
  let exited = false;
  let epoch = 0;
  let mutationSequence = 0;

  /**
   * Require an initialized, ready, and active session for document work.
   *
   * @param {string} method - LSP method.
   * @returns {void}
   */
  function requireReady(method) {
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
    if (!ready) {
      throw new LanguageServerError(
        'server_not_ready',
        'The client has not completed Language Server initialization.',
        { method },
      );
    }
  }

  /**
   * Allocate and register one document mutation identity.
   *
   * @param {string} uri - Validated document URI.
   * @returns {Readonly<{epoch: number, sequence: number}>} Mutation identity.
   */
  function beginMutation(uri) {
    mutationSequence += 1;
    const identity = Object.freeze({ epoch, sequence: mutationSequence });
    let active = activeMutations.get(uri);
    if (active === undefined) {
      active = new Set();
      activeMutations.set(uri, active);
    }
    active.add(identity);
    return identity;
  }

  /**
   * Return whether one successful mutation is the newest applicable completion.
   *
   * `beginMutation` registers the identity before delegated work starts and the
   * corresponding `finally` removes it only after this function returns, so an
   * active set is an internal invariant whenever the epoch remains current.
   *
   * @param {string} uri - Validated document URI.
   * @param {Readonly<{epoch: number, sequence: number}>} identity - Captured mutation identity.
   * @returns {boolean} True only for a newest active mutation not superseded by applied work.
   */
  function isCurrentMutation(uri, identity) {
    if (shutdownRequested || exited || epoch !== identity.epoch) {
      return false;
    }
    const active = activeMutations.get(uri);
    if (!active.has(identity)) {
      return false;
    }
    if (identity.sequence <= (lastAppliedSequence.get(uri) ?? 0)) {
      return false;
    }
    for (const candidate of active) {
      if (candidate.sequence > identity.sequence) {
        return false;
      }
    }
    return true;
  }

  /**
   * Remove one settled mutation identity and its empty per-document set.
   *
   * @param {string} uri - Validated document URI.
   * @param {Readonly<{epoch: number, sequence: number}>} identity - Settled identity.
   * @returns {void}
   */
  function finishMutation(uri, identity) {
    const active = activeMutations.get(uri);
    if (active === undefined) {
      return;
    }
    active.delete(identity);
    if (active.size === 0) {
      activeMutations.delete(uri);
    }
  }

  /**
   * Record one successfully applied mutation sequence.
   *
   * @param {string} uri - Validated document URI.
   * @param {Readonly<{epoch: number, sequence: number}>} identity - Applied identity.
   * @returns {void}
   */
  function markApplied(uri, identity) {
    lastAppliedSequence.set(uri, identity.sequence);
  }

  /**
   * Invalidate every owned document snapshot and in-flight mutation.
   *
   * @returns {void}
   */
  function invalidateDocuments() {
    epoch += 1;
    documents.clear();
    activeMutations.clear();
    lastAppliedSequence.clear();
  }

  const session = {
    /**
     * Handle an LSP request and provide document symbols for open source.
     *
     * @param {unknown} method - Request method.
     * @param {unknown} [params] - Request parameters.
     * @returns {Promise<unknown>} Request result.
     */
    async request(method, params = null) {
      if (method === 'textDocument/documentSymbol') {
        requireReady(method);
        const normalized = normalizeTextDocumentParams(params, method);
        const record = documents.get(normalized.textDocument.uri);
        if (record === undefined) {
          throw new LanguageServerError('document_not_open', 'The document is not open.', {
            method,
          });
        }
        return documentSymbolsForSource(record.text);
      }

      const result = await diagnosticSession.request(method, params);
      if (method === 'initialize') {
        initialized = true;
        return advertiseDocumentSymbols(result);
      }
      if (method === 'shutdown') {
        shutdownRequested = true;
        invalidateDocuments();
      }
      return result;
    },

    /**
     * Handle an LSP notification and mirror accepted full-document snapshots.
     *
     * @param {unknown} method - Notification method.
     * @param {unknown} [params] - Notification parameters.
     * @returns {Promise<void>}
     */
    async notify(method, params = null) {
      if (method === 'textDocument/didOpen') {
        requireReady(method);
        const normalized = normalizeOpenParams(params);
        const uri = normalized.textDocument.uri;
        const identity = beginMutation(uri);
        try {
          await diagnosticSession.notify(method, normalized);
          if (isCurrentMutation(uri, identity)) {
            documents.set(uri, Object.freeze({
              version: normalized.textDocument.version,
              text: normalized.textDocument.text,
            }));
            markApplied(uri, identity);
          }
        } finally {
          finishMutation(uri, identity);
        }
        return;
      }
      if (method === 'textDocument/didChange') {
        requireReady(method);
        const normalized = normalizeChangeParams(params);
        const uri = normalized.textDocument.uri;
        const identity = beginMutation(uri);
        try {
          await diagnosticSession.notify(method, normalized);
          if (isCurrentMutation(uri, identity)) {
            documents.set(uri, Object.freeze({
              version: normalized.textDocument.version,
              text: normalized.contentChanges[0].text,
            }));
            markApplied(uri, identity);
          }
        } finally {
          finishMutation(uri, identity);
        }
        return;
      }
      if (method === 'textDocument/didClose') {
        requireReady(method);
        const normalized = normalizeTextDocumentParams(params, method);
        const uri = normalized.textDocument.uri;
        const identity = beginMutation(uri);
        try {
          await diagnosticSession.notify(method, normalized);
          if (isCurrentMutation(uri, identity)) {
            documents.delete(uri);
            markApplied(uri, identity);
          }
        } finally {
          finishMutation(uri, identity);
        }
        return;
      }

      await diagnosticSession.notify(method, params);
      if (method === 'initialized') {
        ready = true;
      } else if (method === 'exit') {
        exited = true;
        invalidateDocuments();
      }
    },

    /**
     * Dispose the delegated session and invalidate all outline source.
     *
     * @returns {void}
     */
    dispose() {
      exited = true;
      invalidateDocuments();
      diagnosticSession.dispose();
    },
  };
  return Object.freeze(session);
}
