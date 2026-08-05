import {
  PlantUmlRendererError,
  sanitizePlantUmlDiagnostics,
} from '@contextualwisdomlab/diagramweave-plantuml-renderer';

/**
 * Create one fixed source-free diagnostic for an operational renderer failure.
 *
 * @returns {Readonly<object>} Deeply frozen zero-width diagnostic.
 */
function createOperationalDiagnostic() {
  const position = Object.freeze({ line: 0, character: 0 });
  return Object.freeze({
    range: Object.freeze({ start: position, end: position }),
    severity: 1,
    code: 'diagramweave.renderer',
    source: 'diagramweave',
    message: 'DiagramWeave could not validate this document.',
  });
}

const operationalDiagnostics = Object.freeze([createOperationalDiagnostic()]);
const emptyDiagnostics = Object.freeze([]);

/**
 * Convert one renderer outcome into a deeply frozen LSP diagnostic collection.
 *
 * PlantUML syntax diagnostics are accepted only from the renderer package's
 * own stable error class and pass through its exact-schema sanitizer. All other
 * failures collapse to one fixed operational diagnostic.
 *
 * @param {unknown} error - Renderer rejection or null for success.
 * @returns {readonly Readonly<object>[]} Frozen public diagnostics.
 */
export function diagnosticsForRendererOutcome(error) {
  if (error === null) {
    return emptyDiagnostics;
  }
  if (error instanceof PlantUmlRendererError) {
    const diagnostics = sanitizePlantUmlDiagnostics(error.diagnostics);
    if (diagnostics.length > 0) {
      return diagnostics;
    }
  }
  return operationalDiagnostics;
}
