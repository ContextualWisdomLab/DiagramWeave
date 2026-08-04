import {
  sanitizePlantUmlDiagnostics,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

const emptyDiagnostics = sanitizePlantUmlDiagnostics(undefined);

/**
 * Return whether a value can safely supply object fields.
 *
 * @param {unknown} value - Candidate record.
 * @returns {boolean} True for non-null objects only.
 */
function isRecord(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Sanitize renderer diagnostics for stable CLI and integration reports.
 *
 * The renderer package owns the exact diagnostic schema. This wrapper keeps the
 * CLI API explicit while reusing the same bounded cloning and validation logic.
 *
 * @param {unknown} value - Untrusted renderer `diagnostics` value.
 * @returns {readonly Readonly<object>[]} Frozen source-free diagnostics.
 */
export function sanitizeRendererDiagnostics(value) {
  return sanitizePlantUmlDiagnostics(value);
}

/**
 * Read and sanitize diagnostics from an untrusted renderer error.
 *
 * Property access is isolated because an arbitrary provider error may expose a
 * hostile getter or Proxy. Such values become the shared empty collection.
 *
 * @param {unknown} error - Untrusted renderer failure.
 * @returns {readonly Readonly<object>[]} Frozen source-free diagnostics.
 */
export function diagnosticsFromRendererError(error) {
  try {
    return isRecord(error)
      ? sanitizeRendererDiagnostics(error.diagnostics)
      : emptyDiagnostics;
  } catch {
    return emptyDiagnostics;
  }
}
