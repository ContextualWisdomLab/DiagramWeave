import { Buffer } from 'node:buffer';
import { isAbsolute } from 'node:path';

import { LanguageServerError } from './errors.js';
import { languageServerLimits } from './limits.js';

const controlCharacters = /[\u0000-\u001f\u007f]/u;
const supportedExtensions = /\.(?:puml|plantuml)$/iu;
const supportedLanguageIds = new Set(['plantuml', 'puml']);

/**
 * Return whether a value is a plain record without allowing prototype traps to escape.
 *
 * @param {unknown} value - Candidate record.
 * @returns {boolean} True for Object- or null-prototype records.
 */
export function isPlainRecord(value) {
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
 * Require one safe nonempty string.
 *
 * @param {unknown} value - Candidate value.
 * @param {string} field - Public field name.
 * @returns {string} Validated string.
 */
export function requireSafeString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || controlCharacters.test(value)) {
    throw new LanguageServerError(
      'invalid_request',
      `${field} must be a nonempty string without control characters.`,
      { field },
    );
  }
  return value;
}

/**
 * Normalize one LSP file URI while retaining the client-provided spelling.
 *
 * The server never dereferences the URI; source text arrives in LSP notifications.
 *
 * @param {unknown} value - Candidate document URI.
 * @returns {string} Validated URI.
 */
export function normalizeDocumentUri(value) {
  const uri = requireSafeString(value, 'uri');
  if (Buffer.byteLength(uri, 'utf8') > languageServerLimits.maxUriBytes) {
    throw new LanguageServerError('document_uri_invalid', 'The document URI is too large.', {
      field: 'uri',
    });
  }
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new LanguageServerError('document_uri_invalid', 'The document URI is invalid.', {
      field: 'uri',
    });
  }
  if (
    parsed.protocol !== 'file:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    (parsed.hostname !== '' && parsed.hostname.toLowerCase() !== 'localhost') ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !supportedExtensions.test(parsed.pathname)
  ) {
    throw new LanguageServerError(
      'document_uri_invalid',
      'The document URI must identify a local .puml or .plantuml file.',
      { field: 'uri' },
    );
  }
  return uri;
}

/**
 * Normalize one supported Language Server document version.
 *
 * @param {unknown} value - Candidate version.
 * @returns {number} Nonnegative safe integer version.
 */
export function normalizeDocumentVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LanguageServerError(
      'document_version_invalid',
      'The document version must be a nonnegative safe integer.',
      { field: 'version' },
    );
  }
  return value;
}

/**
 * Normalize one complete PlantUML document snapshot.
 *
 * @param {unknown} text - Candidate source text.
 * @returns {string} Source text within the responsive session ceiling.
 */
export function normalizeDocumentText(text) {
  if (typeof text !== 'string') {
    throw new LanguageServerError('document_text_invalid', 'Document text must be a string.', {
      field: 'text',
    });
  }
  if (Buffer.byteLength(text, 'utf8') > languageServerLimits.maxDocumentBytes) {
    throw new LanguageServerError('document_too_large', 'The document exceeds the session limit.', {
      field: 'text',
    });
  }
  return text;
}

/**
 * Normalize one supported PlantUML language identifier.
 *
 * @param {unknown} value - Candidate language identifier.
 * @returns {string} Supported language identifier.
 */
export function normalizeLanguageId(value) {
  const languageId = requireSafeString(value, 'languageId').toLowerCase();
  if (!supportedLanguageIds.has(languageId)) {
    throw new LanguageServerError(
      'document_language_unsupported',
      'The document language must be plantuml or puml.',
      { field: 'languageId' },
    );
  }
  return languageId;
}

/**
 * Normalize a host-supplied absolute renderer path.
 *
 * @param {unknown} value - Candidate path.
 * @param {string} field - Public field name.
 * @returns {string} Validated absolute path.
 */
export function normalizeRendererPath(value, field) {
  const path = requireSafeString(value, field);
  if (!isAbsolute(path)) {
    throw new LanguageServerError('invalid_options', `${field} must be an absolute path.`, {
      field,
    });
  }
  return path;
}
