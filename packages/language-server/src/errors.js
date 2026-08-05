/**
 * Stable source-free error raised by the DiagramWeave Language Server foundation.
 */
export class LanguageServerError extends Error {
  /**
   * Create one public language-server error.
   *
   * @param {string} code - Stable machine-readable code.
   * @param {string} message - Source-free human-readable message.
   * @param {{field?: string, method?: string}} [details] - Safe scalar metadata.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LanguageServerError';
    this.code = code;
    if (details.field !== undefined) {
      this.field = details.field;
    }
    if (details.method !== undefined) {
      this.method = details.method;
    }
  }
}
