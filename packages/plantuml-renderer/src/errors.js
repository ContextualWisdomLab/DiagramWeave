const emptyDiagnostics = Object.freeze([]);
const maximumLineIndex = 2_147_483_647;

/**
 * Return whether a value can safely supply object fields.
 *
 * @param {unknown} value - Candidate record.
 * @returns {boolean} True for non-null objects.
 */
function isRecord(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Clone one exact PlantUML diagnostic or reject it.
 *
 * @param {unknown} value - Candidate diagnostic.
 * @returns {Readonly<object>|null} Frozen safe clone or null.
 */
function cloneDiagnostic(value) {
  if (!isRecord(value) || !isRecord(value.range)) {
    return null;
  }
  const { start, end } = value.range;
  if (!isRecord(start) || !isRecord(end)) {
    return null;
  }
  if (
    !Number.isInteger(start.line) ||
    start.line < 0 ||
    start.line > maximumLineIndex ||
    start.character !== 0 ||
    end.line !== start.line ||
    end.character !== 0 ||
    value.severity !== 1 ||
    value.code !== 'plantuml.syntax' ||
    value.source !== 'plantuml' ||
    value.message !== 'PlantUML reported a syntax error.' ||
    !isRecord(value.data) ||
    value.data.plantUmlLineNumber !== start.line + 1
  ) {
    return null;
  }
  const position = Object.freeze({ line: start.line, character: 0 });
  return Object.freeze({
    range: Object.freeze({ start: position, end: position }),
    severity: 1,
    code: 'plantuml.syntax',
    source: 'plantuml',
    message: 'PlantUML reported a syntax error.',
    data: Object.freeze({ plantUmlLineNumber: start.line + 1 }),
  });
}

/**
 * Clone a bounded diagnostic collection without retaining caller-owned data.
 *
 * @param {unknown} value - Candidate diagnostics collection.
 * @returns {readonly Readonly<object>[]} Frozen safe diagnostics.
 */
function cloneDiagnostics(value) {
  if (!Array.isArray(value) || value.length > 32) {
    return emptyDiagnostics;
  }
  const diagnostics = [];
  try {
    for (const item of value) {
      const diagnostic = cloneDiagnostic(item);
      if (diagnostic === null) {
        return emptyDiagnostics;
      }
      diagnostics.push(diagnostic);
    }
  } catch {
    return emptyDiagnostics;
  }
  return diagnostics.length === 0
    ? emptyDiagnostics
    : Object.freeze(diagnostics);
}

/**
 * Stable PlantUML renderer error with safe structured metadata.
 *
 * Public messages intentionally omit source text, child stderr, executable
 * paths, and credentials. Callers should branch on `code` rather than message
 * text and may use `field`, `stream`, `exitCode`, `signal`, and source-free
 * `diagnostics` when present.
 */
export class PlantUmlRendererError extends Error {
  /**
   * Create one safe renderer error.
   *
   * @param {string} code - Stable machine-readable error code.
   * @param {string} message - Source-free human-readable message.
   * @param {{field?: string, stream?: string, exitCode?: number, signal?: string, diagnostics?: unknown}} [details] - Safe structured details.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlantUmlRendererError';
    this.code = code;
    this.diagnostics = cloneDiagnostics(details.diagnostics);
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
