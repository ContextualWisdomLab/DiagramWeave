/**
 * Stable DiagramWeave CLI exit-code contract.
 */
export const cliExitCodes = Object.freeze({
  success: 0,
  diagramFailure: 1,
  invocationFailure: 2,
});

/**
 * Stable source-free DiagramWeave CLI error.
 */
export class CliError extends Error {
  /**
   * Create one safe CLI error.
   *
   * @param {string} code - Stable machine-readable error code.
   * @param {string} message - Source-free human-readable message.
   * @param {{field?: string, relativePath?: string}} [details] - Safe optional metadata.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    if (details.field !== undefined) {
      this.field = details.field;
    }
    if (details.relativePath !== undefined) {
      this.relativePath = details.relativePath;
    }
  }
}
