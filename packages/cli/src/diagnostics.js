const emptyDiagnostics = Object.freeze([]);
const maximumLineIndex = 2_147_483_647;

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
 * Clone one exact renderer diagnostic or reject it.
 *
 * DiagramWeave currently exposes only PlantUML syntax errors at a zero-width
 * line-start range. Exact-value validation prevents arbitrary renderer or
 * provider metadata from reaching CLI JSON, terminal output, logs, or naruon.
 *
 * @param {unknown} value - Untrusted renderer diagnostic.
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
 * Sanitize renderer diagnostics for stable CLI and integration reports.
 *
 * The complete collection fails closed when its shape is absent, oversized,
 * hostile, or contains any unsupported diagnostic. At most 32 diagnostics are
 * accepted so error reporting remains bounded even when a future renderer
 * reports multiple diagrams.
 *
 * @param {unknown} value - Untrusted renderer `diagnostics` value.
 * @returns {readonly Readonly<object>[]} Frozen source-free diagnostics.
 */
export function sanitizeRendererDiagnostics(value) {
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
