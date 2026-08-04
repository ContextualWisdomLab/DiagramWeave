/**
 * Stable PlantUML renderer error with safe structured metadata.
 *
 * Public messages intentionally omit source text, child stderr, executable
 * paths, and credentials. Callers should branch on `code` rather than message
 * text and may use `field`, `stream`, `exitCode`, and `signal` when present.
 */
export class PlantUmlRendererError extends Error {
  /**
   * Create one safe renderer error.
   *
   * @param {string} code - Stable machine-readable error code.
   * @param {string} message - Source-free human-readable message.
   * @param {{field?: string, stream?: string, exitCode?: number, signal?: string}} [details] - Safe structured details.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlantUmlRendererError';
    this.code = code;
    if (details.field !== undefined) {
      this.field = details.field;
    }
    if (details.stream !== undefined) {
      this.stream = details.stream;
    }
    if (details.exitCode !== undefined) {
      this.exitCode = details.exitCode;
    }
    if (details.signal !== undefined) {
      this.signal = details.signal;
    }
  }
}
