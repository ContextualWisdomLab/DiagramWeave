import { TextDecoder } from 'node:util';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const emptyDiagnostics = Object.freeze([]);
const maximumLineNumber = 2_147_483_647;

/**
 * Return one deeply frozen LSP-compatible PlantUML syntax diagnostic.
 *
 * PlantUML's `-stdrpt:1` protocol reports a one-based line but no character
 * span. The renderer therefore exposes a zero-width range at the beginning of
 * the corresponding zero-based line. The raw PlantUML label is intentionally
 * not copied because renderer diagnostics must never echo source or stderr.
 *
 * @param {number} plantUmlLineNumber - Valid one-based PlantUML line number.
 * @returns {Readonly<object>} Deeply frozen source-free diagnostic.
 */
function createSyntaxDiagnostic(plantUmlLineNumber) {
  const position = Object.freeze({
    line: plantUmlLineNumber - 1,
    character: 0,
  });
  return Object.freeze({
    range: Object.freeze({
      start: position,
      end: position,
    }),
    severity: 1,
    code: 'plantuml.syntax',
    source: 'plantuml',
    message: 'PlantUML reported a syntax error.',
    data: Object.freeze({ plantUmlLineNumber }),
  });
}

/**
 * Return one immutable standard-report result.
 *
 * @param {1|null} protocolVersion - Recognized protocol version.
 * @param {'ok'|'error'|'unknown'|'invalid'} status - Parsed report status.
 * @param {readonly object[]} diagnostics - Safe structured diagnostics.
 * @returns {Readonly<object>} Frozen parser result.
 */
function createReport(protocolVersion, status, diagnostics = emptyDiagnostics) {
  return Object.freeze({ protocolVersion, status, diagnostics });
}

/**
 * Parse bounded PlantUML `-stdrpt:1` bytes without exposing raw diagnostics.
 *
 * Known scalar fields fail closed when malformed or duplicated. Repeated
 * `status` fields are accepted because an `ERROR` status must win over an
 * earlier `OK` status. Unknown keys and the human-readable suffix emitted by
 * PlantUML are ignored. Only protocol version 1 is currently recognized.
 *
 * @param {unknown} diagnostics - Bounded stderr bytes from PlantUML.
 * @returns {Readonly<{
 *   protocolVersion: 1|null,
 *   status: 'ok'|'error'|'unknown'|'invalid',
 *   diagnostics: readonly object[],
 * }>} Immutable source-free standard-report result.
 */
export function parsePlantUmlStandardReport(diagnostics) {
  if (!(diagnostics instanceof Uint8Array)) {
    return createReport(null, 'invalid');
  }

  let text;
  try {
    text = utf8Decoder.decode(diagnostics);
  } catch {
    return createReport(null, 'invalid');
  }

  let protocolVersion = null;
  let sawProtocolVersion = false;
  let status = 'unknown';
  let lineNumber = null;
  let sawLineNumber = false;

  for (const line of text.split(/\r?\n/u)) {
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);

    if (key === 'protocolVersion') {
      if (sawProtocolVersion || value !== '1') {
        return createReport(null, 'invalid');
      }
      sawProtocolVersion = true;
      protocolVersion = 1;
      continue;
    }

    if (key === 'status') {
      if (value === 'ERROR') {
        status = 'error';
      } else if (value !== 'OK') {
        return createReport(null, 'invalid');
      } else if (status !== 'error') {
        status = 'ok';
      }
      continue;
    }

    if (key === 'lineNumber') {
      if (sawLineNumber || !/^[1-9][0-9]*$/u.test(value)) {
        return createReport(null, 'invalid');
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed > maximumLineNumber) {
        return createReport(null, 'invalid');
      }
      sawLineNumber = true;
      lineNumber = parsed;
    }
  }

  if (status === 'error' && lineNumber !== null) {
    return createReport(
      protocolVersion,
      status,
      Object.freeze([createSyntaxDiagnostic(lineNumber)]),
    );
  }
  return createReport(protocolVersion, status);
}
