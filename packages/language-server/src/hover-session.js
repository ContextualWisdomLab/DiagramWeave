import {
  isPlainRecord,
  normalizeDocumentText,
  normalizeDocumentUri,
  normalizeDocumentVersion,
  normalizeLanguageId,
} from './contracts.js';
import { declarationHoverForSource } from './declaration-hover.js';
import { LanguageServerError } from './errors.js';
import { createFoldingLanguageServerSession } from './folding-session.js';

const maximumContentFormats = 16;
const supportedMarkupKinds = new Set(['markdown', 'plaintext']);

/**
 * Normalize one client's hover capability under a hostile boundary.
 *
 * A plain hover record enables declaration hover. An absent `contentFormat`
 * selects plaintext. A present format list must be bounded, nonempty, and
 * contain strings only; the first supported entry wins in client preference
 * order. Malformed, proxied, revoked, throwing, or unsupported capability data
 * fails closed without advertising the provider.
 *
 * @param {unknown} params - Candidate initialize parameters.
 * @returns {Readonly<{markupKind: 'markdown'|'plaintext'}>|null} Negotiated options or null.
 */
function hoverOptionsForClient(params) {
  try {
    if (
      !isPlainRecord(params) ||
      !isPlainRecord(params.capabilities) ||
      !isPlainRecord(params.capabilities.textDocument) ||
      !isPlainRecord(params.capabilities.textDocument.hover)
    ) {
      return null;
    }
    const contentFormat = params.capabilities.textDocument.hover.contentFormat;
    if (contentFormat === undefined) {
      return Object.freeze({ markupKind: 'plaintext' });
    }
    if (
      !Array.isArray(contentFormat) ||
      contentFormat.length === 0 ||
      contentFormat.length > maximumContentFormats
    ) {
      return null;
    }
    let markupKind = null;
    for (let index = 0; index < contentFormat.length; index += 1) {
      const candidate = contentFormat[index];
      if (typeof candidate !== 'string') {
        return null;
      }
      if (markupKind === null && supportedMarkupKinds.has(candidate)) {
        markupKind = candidate;
      }
    }
    return markupKind === null ? null : Object.freeze({ markupKind });
  } catch {
    return null;
  }
}

/**
 * Add an immutable static hover provider to one initialize result.
 *
 * @param {Readonly<object>} result - Initialize result from the folding session.
 * @returns {Readonly<object>} Deeply frozen initialize result.
 */
function advertiseHover(result) {
  return Object.freeze({
    ...result,
    capabilities: Object.freeze({
      ...result.capabilities,
      hoverProvider: true,
    }),
  });
}

/**
 * Normalize one didOpen notification into an owned source snapshot.
 *
 * @param {unknown} params - Candidate notification parameters.
 * @returns {Readonly<object>} Frozen trusted parameters.
 */
function normalizeOpenParams(params) {
  let textDocument;
  try {
    if (!isPlainRecord(params) || !isPlainRecord(params.textDocument)) {
      throw new Error('invalid open parameters');
    }
    textDocument = params.textDocument;
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
 * @returns {Readonly<object>} Frozen trusted parameters.
 */
function normalizeChangeParams(params) {
  let textDocument;
  let contentChanges;
  let contentChange;
  try {
    if (!isPlainRecord(params)) {
      throw new Error('invalid change parameters');
    }
    textDocument = params.textDocument;
    contentChanges = params.contentChanges;
    if (
      !isPlainRecord(textDocument) ||
      !Array.isArray(contentChanges) ||
      contentChanges.length !== 1 ||
      !isPlainRecord(contentChanges[0])
    ) {
      throw new Error('invalid change collection');
    }
    contentChange = contentChanges[0];
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
 * Normalize one didClose text-document identifier.
 *
 * @param {unknown} params - Candidate notification parameters.
 * @returns {Readonly<object>} Frozen trusted parameters.
 */
function normalizeCloseParams(params) {
  try {
    if (!isPlainRecord(params) || !isPlainRecord(params.textDocument)) {
      throw new Error('invalid close parameters');
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
    throw new LanguageServerError('invalid_request', 'didClose parameters are invalid.', {
      method: 'textDocument/didClose',
    });
  }
}

/**
 * Normalize one hover request without retaining caller-owned records.
 *
 * @param {unknown} params - Candidate hover parameters.
 * @returns {Readonly<object>} Frozen local identifier and copied position.
 */
function normalizeHoverParams(params) {
  let uri;
  let candidatePosition;
  try {
    if (!isPlainRecord(params) || !isPlainRecord(params.textDocument)) {
      throw new Error('invalid hover parameters');
    }
    uri = normalizeDocumentUri(params.textDocument.uri);
    candidatePosition = params.position;
  } catch (error) {
    if (error instanceof LanguageServerError) {
      throw error;
    }
    throw new LanguageServerError('invalid_request', 'Hover parameters are invalid.', {
      method: 'textDocument/hover',
    });
  }

  try {
    if (!isPlainRecord(candidatePosition)) {
      throw new Error('invalid hover position');
    }
    return Object.freeze({
      textDocument: Object.freeze({ uri }),
      position: Object.freeze({
        line: candidatePosition.line,
        character: candidatePosition.character,
      }),
    });
  } catch {
    throw new LanguageServerError(
      'document_position_invalid',
      'The document position is invalid.',
      { field: 'position', method: 'textDocument/hover' },
    );
  }
}

/**
 * Create a transport-neutral DiagramWeave Language Server with declaration hover.
 *
 * The wrapper composes the folding session and owns only the latest accepted
 * full-document source required by `textDocument/hover`. Hover is advertised
 * and served only after valid capability negotiation. Mutation epochs, active
 * sequences, and latest applied sequences prevent rejected, stale, closed, or
 * superseded document work from restoring obsolete hover evidence.
 *
 * @param {unknown} options - Renderer and notification options for the composed session.
 * @returns {Readonly<{
 *   request(method: unknown, params?: unknown): Promise<unknown>,
 *   notify(method: unknown, params?: unknown): Promise<void>,
 *   dispose(): void,
 * }>} Frozen Language Server API.
 */
export function createHoverLanguageServerSession(options) {
  const languageSession = createFoldingLanguageServerSession(options);
  const documents = new Map();
  const activeMutations = new Map();
  const lastAppliedSequence = new Map();
  let initialized = false;
  let ready = false;
  let hoverOptions = null;
  let shutdownRequested = false;
  let exited = false;
  let epoch = 0;
  let mutationSequence = 0;

  /**
   * Require a completed active Language Server lifecycle.
   *
   * @param {string} method - Request or notification method.
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
   * Register one source mutation identity.
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
   * Return whether one successful mutation may update the hover snapshot.
   *
   * @param {string} uri - Validated document URI.
   * @param {Readonly<{epoch: number, sequence: number}>} identity - Mutation identity.
   * @returns {boolean} True only for the newest applicable successful mutation.
   */
  function isCurrentMutation(uri, identity) {
    if (shutdownRequested || exited || epoch !== identity.epoch) {
      return false;
    }
    const active = activeMutations.get(uri);
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
   * Remove one settled mutation identity.
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
   * Record one successfully applied mutation.
   *
   * @param {string} uri - Validated document URI.
   * @param {Readonly<{epoch: number, sequence: number}>} identity - Applied identity.
   * @returns {void}
   */
  function markApplied(uri, identity) {
    lastAppliedSequence.set(uri, identity.sequence);
  }

  /**
   * Invalidate every hover snapshot and in-flight mutation.
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
     * Handle one LSP request, including evidence-bounded declaration hover.
     *
     * @param {unknown} method - Request method.
     * @param {unknown} [params] - Request parameters.
     * @returns {Promise<unknown>} Request result.
     */
    async request(method, params = null) {
      if (method === 'textDocument/hover') {
        requireReady(method);
        if (hoverOptions === null) {
          throw new LanguageServerError('method_not_found', 'The request method is not supported.', {
            method,
          });
        }
        const normalized = normalizeHoverParams(params);
        const record = documents.get(normalized.textDocument.uri);
        if (record === undefined) {
          throw new LanguageServerError('document_not_open', 'The document is not open.', {
            method,
          });
        }
        return declarationHoverForSource(
          record.text,
          normalized.position,
          hoverOptions.markupKind,
        );
      }

      const negotiatedOptions = method === 'initialize'
        ? hoverOptionsForClient(params)
        : null;
      const result = await languageSession.request(method, params);
      if (method === 'initialize') {
        initialized = true;
        hoverOptions = negotiatedOptions;
        return negotiatedOptions === null ? result : advertiseHover(result);
      }
      if (method === 'shutdown') {
        shutdownRequested = true;
        invalidateDocuments();
      }
      return result;
    },

    /**
     * Handle one LSP notification and mirror accepted source snapshots.
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
          await languageSession.notify(method, normalized);
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
          await languageSession.notify(method, normalized);
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
        const normalized = normalizeCloseParams(params);
        const uri = normalized.textDocument.uri;
        const identity = beginMutation(uri);
        try {
          await languageSession.notify(method, normalized);
          if (isCurrentMutation(uri, identity)) {
            documents.delete(uri);
            markApplied(uri, identity);
          }
        } finally {
          finishMutation(uri, identity);
        }
        return;
      }

      await languageSession.notify(method, params);
      if (method === 'initialized') {
        ready = true;
      } else if (method === 'exit') {
        exited = true;
        invalidateDocuments();
      }
    },

    /**
     * Dispose the composed session and every hover snapshot.
     *
     * @returns {void}
     */
    dispose() {
      exited = true;
      invalidateDocuments();
      languageSession.dispose();
    },
  };
  return Object.freeze(session);
}
