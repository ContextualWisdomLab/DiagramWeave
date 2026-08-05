/**
 * Stable source-free error raised by the DiagramWeave JSON-RPC stdio transport.
 */
export class LanguageServerStdioError extends Error {
  /**
   * Create one public transport error.
   *
   * @param {string} code - Stable machine-readable code.
   * @param {string} message - Source-free human-readable message.
   * @param {{fatal?: boolean, jsonRpcCode?: number, responseId?: string|number|null}} [details] - Safe protocol metadata.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LanguageServerStdioError';
    this.code = code;
    this.fatal = details.fatal === true;
    if (details.jsonRpcCode !== undefined) {
      this.jsonRpcCode = details.jsonRpcCode;
    }
    if (details.responseId !== undefined) {
      this.responseId = details.responseId;
    }
  }
}
