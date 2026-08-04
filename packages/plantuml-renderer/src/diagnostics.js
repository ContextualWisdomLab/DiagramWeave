import { TextDecoder } from 'node:util';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const recognizedFields = Object.freeze([
  'protocolVersion',
  'status',
  'lineNumber',
  'label',
]);
const maximumLineNumber = 2147483647;

/**
 * Create the immutable parser result used for unknown or invalid reports.
 *
 * @param {number|null} protocolVersion - Supported protocol version when known.
 * @param {'unknown'|'invalid'} status - Safe parser state.
 * @returns {Readonly<object>} Frozen result without a diagnostic.
 */
function emptyResult(protocolVersion, status) {
  return Object.freeze({
    protocolVersion,
    status,
    diagnostic: null,
  });
}

/**
 * Create one immutable source-free PlantUML error diagnostic.
 *
 * Raw PlantUML labels are never copied. Only the two documented syntax labels
 * select the syntax-specific code; every other label maps to a generic product
 * message so source text cannot leak through a provider-controlled field.
 *
 * @param {string|null} label - Parsed but untrusted PlantUML label.
 * @param {number|null} lineNumber - Valid one-based line number when present.
 * @returns {Readonly<object>} Frozen public diagnostic record.
 */
function createDiagnostic(label, lineNumber) {
  const syntax = label === 'Syntax Error' || label === 'Syntax Error?';
  return Object.freeze({
    schemaVersion: 1,
    source: 'plantuml',
    severity: 'error',
    code: syntax ? 'plantuml_syntax_error' : 'plantuml_error',
    message: syntax
      ? 'PlantUML reported a syntax error.'
      : 'PlantUML reported a diagram error.',
    lineNumber,
    columnNumber: null,
  });
}

/**
 * Return a recognized standard-report field from one complete line.
 *
 * Narrative lines such as `previous status=ERROR text` are intentionally not
 * interpreted. A field is recognized only when the whole line starts with an
 * exact documented key followed immediately by `=`.
 *
 * @param {string} line - One decoded line without a newline delimiter.
 * @returns {{key: string, value: string}|null} Parsed field or null.
 */
function recognizedField(line) {
  for (const key of recognizedFields) {
    const prefix = `${key}=`;
    if (line.startsWith(prefix)) {
      return { key, value: line.slice(prefix.length) };
    }
  }
  return null;
}

/**
 * Parse one optional PlantUML protocol version.
 *
 * @param {string|undefined} value - Raw field value.
 * @returns {1|null|false} Supported version, absence, or false when malformed.
 */
function parseProtocolVersion(value) {
  if (value === undefined) {
    return null;
  }
  return value === '1' ? 1 : false;
}

/**
 * Parse one optional one-based diagnostic line number.
 *
 * @param {string|undefined} value - Raw field value.
 * @returns {number|null|false} Valid line, absence, or false when malformed.
 */
function parseLineNumber(value) {
  if (value === undefined) {
    return null;
  }
  if (!/^[1-9][0-9]*$/u.test(value)) {
    return false;
  }
  const lineNumber = Number(value);
  return Number.isSafeInteger(lineNumber) && lineNumber <= maximumLineNumber
    ? lineNumber
    : false;
}

/**
 * Parse bounded PlantUML `-stdrpt:1` bytes into a safe immutable result.
 *
 * The function recognizes only protocol version, status, line number, and
 * label fields. Duplicate or malformed recognized fields fail closed. Unknown
 * fields and narrative lines are ignored and never retained. Raw labels and
 * raw stderr never appear in the returned object.
 *
 * @param {Buffer} diagnostics - Bounded stderr bytes collected by the renderer.
 * @returns {Readonly<{
 *   protocolVersion: number|null,
 *   status: 'ok'|'error'|'unknown'|'invalid',
 *   diagnostic: Readonly<object>|null
 * }>} Frozen structured report.
 * @throws {TypeError} When diagnostics is not a Node.js Buffer.
 */
export function parsePlantUmlStandardReport(diagnostics) {
  if (!Buffer.isBuffer(diagnostics)) {
    throw new TypeError('diagnostics must be a Buffer.');
  }

  let text;
  try {
    text = utf8Decoder.decode(diagnostics);
  } catch {
    return emptyResult(null, 'invalid');
  }

  const fields = Object.create(null);
  for (const line of text.split(/\r?\n/u)) {
    const field = recognizedField(line);
    if (field === null) {
      continue;
    }
    if (Object.hasOwn(fields, field.key)) {
      return emptyResult(null, 'invalid');
    }
    fields[field.key] = field.value;
  }

  const protocolVersion = parseProtocolVersion(fields.protocolVersion);
  if (protocolVersion === false) {
    return emptyResult(null, 'invalid');
  }

  if (fields.status === undefined) {
    if (fields.lineNumber !== undefined || fields.label !== undefined) {
      return emptyResult(null, 'invalid');
    }
    return emptyResult(protocolVersion, 'unknown');
  }
  if (fields.status !== 'OK' && fields.status !== 'ERROR') {
    return emptyResult(null, 'invalid');
  }

  const lineNumber = parseLineNumber(fields.lineNumber);
  if (lineNumber === false) {
    return emptyResult(null, 'invalid');
  }

  if (fields.status === 'OK') {
    return Object.freeze({
      protocolVersion,
      status: 'ok',
      diagnostic: null,
    });
  }

  return Object.freeze({
    protocolVersion,
    status: 'error',
    diagnostic: createDiagnostic(fields.label ?? null, lineNumber),
  });
}
