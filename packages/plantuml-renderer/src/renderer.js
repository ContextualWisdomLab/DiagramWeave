import { spawn } from 'node:child_process';
import { dirname, isAbsolute, normalize } from 'node:path';
import { TextDecoder } from 'node:util';

import { hashSource } from '@contextualwisdomlab/diagramweave-core';

import { PlantUmlRendererError } from './errors.js';
import { parsePlantUmlStandardReport } from './standard-report.js';
import { plantUmlRendererLimits } from './limits.js';
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngEnd = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const supportedFormats = new Set(['png', 'svg']);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Raise a stable renderer input-validation error.
 *
 * @param {'invalid_renderer_options'|'invalid_render_request'} code - Validation category.
 * @param {string} field - Invalid field path.
 * @param {string} message - Safe validation message.
 * @throws {PlantUmlRendererError} Always.
 */
function rejectInput(code, field, message) {
  throw new PlantUmlRendererError(code, message, { field });
}

/**
 * Return whether a value is a plain record with Object.prototype or null prototype.
 *
 * @param {unknown} value - Candidate value.
 * @returns {boolean} True only for plain record-like objects.
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validate and normalize one absolute executable or JAR path.
 *
 * Leading or trailing whitespace and control characters are rejected rather
 * than normalized silently because the path crosses a process boundary.
 *
 * @param {unknown} value - Candidate path.
 * @param {string} field - Field name for a validation error.
 * @returns {string} Platform-normalized absolute path.
 */
function validateAbsolutePath(value, field) {
  if (typeof value !== 'string') {
    rejectInput('invalid_renderer_options', field, `${field} must be a string.`);
  }
  if (value.trim().length === 0) {
    rejectInput('invalid_renderer_options', field, `${field} must not be empty.`);
  }
  if (value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    rejectInput(
      'invalid_renderer_options',
      field,
      `${field} must not contain surrounding whitespace or control characters.`,
    );
  }
  if (value.length > 4096) {
    rejectInput('invalid_renderer_options', field, `${field} must be at most 4096 characters.`);
  }
  if (!isAbsolute(value)) {
    rejectInput('invalid_renderer_options', field, `${field} must be an absolute path.`);
  }
  return normalize(value);
}

/**
 * Validate an integer limit inside an inclusive interval.
 *
 * @param {unknown} value - Candidate integer.
 * @param {string} field - Field name for a validation error.
 * @param {number} minimum - Inclusive minimum.
 * @param {number} maximum - Inclusive maximum.
 * @returns {number} Validated integer.
 */
function validateLimit(value, field, minimum, maximum) {
  if (!Number.isInteger(value)) {
    rejectInput('invalid_renderer_options', field, `${field} must be an integer.`);
  }
  if (value < minimum) {
    rejectInput('invalid_renderer_options', field, `${field} must be at least ${minimum}.`);
  }
  if (value > maximum) {
    rejectInput('invalid_renderer_options', field, `${field} must be at most ${maximum}.`);
  }
  return value;
}

/**
 * Validate renderer construction options and clone the process boundary.
 *
 * @param {unknown} options - Untrusted renderer options.
 * @returns {Readonly<object>} Frozen normalized options.
 */
function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    rejectInput('invalid_renderer_options', 'options', 'options must be a plain object.');
  }
  const javaPath = validateAbsolutePath(options.javaPath, 'javaPath');
  const jarPath = validateAbsolutePath(options.jarPath, 'jarPath');
  const timeoutMs = validateLimit(
    options.timeoutMs === undefined
      ? plantUmlRendererLimits.timeoutMs.default
      : options.timeoutMs,
    'timeoutMs',
    plantUmlRendererLimits.timeoutMs.minimum,
    plantUmlRendererLimits.timeoutMs.maximum,
  );
  const maxSourceBytes = validateLimit(
    options.maxSourceBytes === undefined
      ? plantUmlRendererLimits.maxSourceBytes.default
      : options.maxSourceBytes,
    'maxSourceBytes',
    plantUmlRendererLimits.maxSourceBytes.minimum,
    plantUmlRendererLimits.maxSourceBytes.maximum,
  );
  const maxOutputBytes = validateLimit(
    options.maxOutputBytes === undefined
      ? plantUmlRendererLimits.maxOutputBytes.default
      : options.maxOutputBytes,
    'maxOutputBytes',
    plantUmlRendererLimits.maxOutputBytes.minimum,
    plantUmlRendererLimits.maxOutputBytes.maximum,
  );
  const maxDiagnosticBytes = validateLimit(
    options.maxDiagnosticBytes === undefined
      ? plantUmlRendererLimits.maxDiagnosticBytes.default
      : options.maxDiagnosticBytes,
    'maxDiagnosticBytes',
    plantUmlRendererLimits.maxDiagnosticBytes.minimum,
    plantUmlRendererLimits.maxDiagnosticBytes.maximum,
  );
  const spawnImpl = options.spawnImpl === undefined ? spawn : options.spawnImpl;
  if (typeof spawnImpl !== 'function') {
    rejectInput('invalid_renderer_options', 'spawnImpl', 'spawnImpl must be a function.');
  }
  return Object.freeze({
    javaPath,
    jarPath,
    timeoutMs,
    maxSourceBytes,
    maxOutputBytes,
    maxDiagnosticBytes,
    spawnImpl,
  });
}

/**
 * Validate one local rendering request.
 *
 * Source is measured as UTF-8 bytes because it crosses stdin as UTF-8. NUL is
 * rejected to avoid ambiguous downstream text handling. SVG is the default
 * because it is scalable and directly inspectable by the future Studio host.
 *
 * @param {unknown} request - Untrusted render request.
 * @param {number} maxSourceBytes - Maximum accepted UTF-8 source size.
 * @returns {Readonly<{source: string, sourceBytes: Buffer, format: 'png'|'svg'}>} Frozen request.
 */
function normalizeRequest(request, maxSourceBytes) {
  if (!isPlainObject(request)) {
    rejectInput('invalid_render_request', 'request', 'request must be a plain object.');
  }
  if (typeof request.source !== 'string') {
    rejectInput('invalid_render_request', 'source', 'source must be a string.');
  }
  if (request.source.includes('\u0000')) {
    rejectInput('invalid_render_request', 'source', 'source must not contain NUL characters.');
  }
  const sourceBytes = Buffer.from(request.source, 'utf8');
  if (sourceBytes.byteLength > maxSourceBytes) {
    rejectInput(
      'invalid_render_request',
      'source',
      `source must be at most ${maxSourceBytes} UTF-8 bytes.`,
    );
  }
  const format = request.format === undefined ? 'svg' : request.format;
  if (!supportedFormats.has(format)) {
    rejectInput('invalid_render_request', 'format', 'format must be png or svg.');
  }
  return Object.freeze({ source: request.source, sourceBytes, format });
}

/**
 * Return the fixed PlantUML command arguments for one safe pipe render.
 *
 * @param {Readonly<object>} options - Normalized renderer options.
 * @param {'png'|'svg'} format - Requested output format.
 * @returns {readonly string[]} Frozen argument array.
 */
function buildArguments(options, format) {
  return Object.freeze([
    '-DPLANTUML_SECURITY_PROFILE=SANDBOX',
    '-jar',
    options.jarPath,
    '-charset',
    'UTF-8',
    '-nometadata',
    '-stdrpt:1',
    '-failfast2',
    `-t${format}`,
    '-pipe',
  ]);
}

/**
 * Return whether output is one complete PNG stream.
 *
 * @param {Buffer} output - Bounded renderer output.
 * @returns {boolean} True for a signature-prefixed, IEND-terminated single PNG.
 */
function isValidPng(output) {
  return (
    output.byteLength >= pngSignature.byteLength + pngEnd.byteLength &&
    output.subarray(0, pngSignature.byteLength).equals(pngSignature) &&
    output.subarray(output.byteLength - pngEnd.byteLength).equals(pngEnd) &&
    output.indexOf(pngSignature, 1) === -1
  );
}

/**
 * Return whether one character is whitespace accepted around XML documents.
 *
 * @param {string} character - One UTF-16 code unit.
 * @returns {boolean} True when JavaScript trimming treats it as whitespace.
 */
function isDocumentWhitespace(character) {
  return character.trim().length === 0;
}

/**
 * Skip document whitespace in the requested direction.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Starting index.
 * @param {number} boundary - Exclusive forward or inclusive backward boundary.
 * @param {1|-1} direction - Scan direction.
 * @returns {number} First non-whitespace index, or the boundary.
 */
function skipDocumentWhitespace(text, index, boundary, direction) {
  let cursor = index;
  while (
    cursor !== boundary &&
    isDocumentWhitespace(direction === 1 ? text[cursor] : text[cursor - 1])
  ) {
    cursor += direction;
  }
  return cursor;
}

/**
 * Compare a short ASCII markup token without allocating a lowercase copy.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Candidate token start.
 * @param {string} token - Lowercase ASCII token.
 * @returns {boolean} True when the token matches case-insensitively.
 */
function matchesAsciiToken(text, index, token) {
  if (index + token.length > text.length) {
    return false;
  }
  for (let offset = 0; offset < token.length; offset += 1) {
    if (text[index + offset].toLowerCase() !== token[offset]) {
      return false;
    }
  }
  return true;
}

/**
 * Read one conservative XML element or document-type name.
 *
 * PlantUML SVG uses ASCII XML names. Restricting this boundary to the XML
 * characters used by SVG avoids accepting malformed markup while preserving
 * every renderer-produced element and namespace prefix.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Candidate name start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {{name: string, end: number}|null} Name and first following index.
 */
function readXmlName(text, index, boundary) {
  const first = text[index];
  if (first === undefined || !/[A-Za-z_:]/u.test(first)) {
    return null;
  }
  let cursor = index + 1;
  while (cursor < boundary && /[A-Za-z0-9_.:-]/u.test(text[cursor])) {
    cursor += 1;
  }
  return { name: text.slice(index, cursor), end: cursor };
}

/**
 * Find an XML tag end while respecting quoted attribute values.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First character after the opening angle bracket.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} Closing angle-bracket index, or -1 when incomplete.
 */
function findTagEnd(text, index, boundary) {
  let quote = null;
  for (let cursor = index; cursor < boundary; cursor += 1) {
    const character = text[cursor];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return cursor;
    }
  }
  return -1;
}

/**
 * Find the end of a bounded processing instruction or CDATA section.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First character after the opening delimiter.
 * @param {string} delimiter - Closing delimiter.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} First index after the delimiter, or -1 when incomplete.
 */
function findDelimitedMarkupEnd(text, index, delimiter, boundary) {
  const end = text.indexOf(delimiter, index);
  return end === -1 || end + delimiter.length > boundary
    ? -1
    : end + delimiter.length;
}

/**
 * Find a well-formed XML comment end.
 *
 * XML comments may not contain an embedded double hyphen. This check keeps
 * malformed comments from hiding element boundaries from the stack scanner.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} start - Comment opening delimiter index.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} First index after the comment, or -1 when malformed.
 */
function findCommentEnd(text, start, boundary) {
  const end = text.indexOf('-->', start + 4);
  if (end === -1 || end + 3 > boundary) {
    return -1;
  }
  const embeddedDoubleHyphen = text.indexOf('--', start + 4);
  return embeddedDoubleHyphen !== -1 && embeddedDoubleHyphen < end
    ? -1
    : end + 3;
}

/**
 * Find the end of one XML document type declaration.
 *
 * The scanner respects quoted identifiers and an optional internal subset so
 * nested greater-than characters do not terminate the declaration early.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First character after the declared root name.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number} First index after the declaration, or -1 when malformed.
 */
function findDoctypeEnd(text, index, boundary) {
  let quote = null;
  let subsetDepth = 0;
  for (let cursor = index; cursor < boundary; cursor += 1) {
    const character = text[cursor];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      subsetDepth += 1;
    } else if (character === ']') {
      if (subsetDepth === 0) {
        return -1;
      }
      subsetDepth -= 1;
    } else if (character === '>' && subsetDepth === 0) {
      return cursor + 1;
    }
  }
  return -1;
}

/**
 * Return whether a processing instruction uses the reserved XML target.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Processing-instruction start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {boolean} True for a case-insensitive XML target boundary.
 */
function isXmlDeclarationTarget(text, index, boundary) {
  const targetEnd = index + 5;
  if (targetEnd >= boundary || !matchesAsciiToken(text, index, '<?xml')) {
    return false;
  }
  const character = text[targetEnd];
  return character === '?' || isDocumentWhitespace(character);
}

/**
 * Skip the restricted XML prologue accepted before the SVG root.
 *
 * One XML declaration may appear first. Comments, non-XML processing
 * instructions, and one DOCTYPE whose declared root is exactly svg may
 * follow. Other declarations and malformed nodes fail closed.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - First non-whitespace document index.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {number|false} First actual element index, or false when malformed.
 */
function skipSvgPrologue(text, index, boundary) {
  let cursor = index;
  let sawNode = false;
  let sawDoctype = false;
  while (cursor < boundary) {
    if (isXmlDeclarationTarget(text, cursor, boundary)) {
      if (sawNode) {
        return false;
      }
      const end = findDelimitedMarkupEnd(text, cursor + 5, '?>', boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (text.startsWith('<!--', cursor)) {
      const end = findCommentEnd(text, cursor, boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (text.startsWith('<?', cursor)) {
      const end = findDelimitedMarkupEnd(text, cursor + 2, '?>', boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (
      matchesAsciiToken(text, cursor, '<!doctype') &&
      cursor + 9 < boundary &&
      isDocumentWhitespace(text[cursor + 9])
    ) {
      if (sawDoctype) {
        return false;
      }
      const nameStart = skipDocumentWhitespace(text, cursor + 9, boundary, 1);
      const declaredRoot = readXmlName(text, nameStart, boundary);
      if (declaredRoot === null || declaredRoot.name !== 'svg') {
        return false;
      }
      const end = findDoctypeEnd(text, declaredRoot.end, boundary);
      if (end === -1) {
        return false;
      }
      sawNode = true;
      sawDoctype = true;
      cursor = skipDocumentWhitespace(text, end, boundary, 1);
      continue;
    }
    if (text.startsWith('<!', cursor)) {
      return false;
    }
    return cursor;
  }
  return cursor;
}

/**
 * Parse one opening or closing XML element token.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} start - Opening angle-bracket index.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {{kind: 'open'|'close', name: string, end: number, selfClosing: boolean}|false} Parsed token or false.
 */
function parseElementToken(text, start, boundary) {
  const isClosing = text[start + 1] === '/';
  const name = readXmlName(text, start + (isClosing ? 2 : 1), boundary);
  if (name === null) {
    return false;
  }
  const tagEnd = findTagEnd(text, name.end, boundary);
  if (tagEnd === -1) {
    return false;
  }
  if (isClosing) {
    const suffixStart = skipDocumentWhitespace(text, name.end, tagEnd, 1);
    if (suffixStart !== tagEnd) {
      return false;
    }
    return { kind: 'close', name: name.name, end: tagEnd + 1, selfClosing: false };
  }
  return {
    kind: 'open',
    name: name.name,
    end: tagEnd + 1,
    selfClosing: text[tagEnd - 1] === '/',
  };
}

/**
 * Validate one complete SVG element tree with an exact element-name stack.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - SVG root start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {boolean} True for one well-formed SVG element tree.
 */
function scanSvgElementTree(text, index, boundary) {
  const elementStack = [];
  let cursor = index;
  let sawRoot = false;
  while (cursor < boundary) {
    if (text[cursor] !== '<') {
      if (elementStack.length === 0) {
        return false;
      }
      const nextTag = text.indexOf('<', cursor);
      cursor = nextTag === -1 ? boundary : nextTag;
      continue;
    }
    if (text.startsWith('<!--', cursor)) {
      if (elementStack.length === 0) {
        return false;
      }
      const end = findCommentEnd(text, cursor, boundary);
      if (end === -1) {
        return false;
      }
      cursor = end;
      continue;
    }
    if (text.startsWith('<![CDATA[', cursor)) {
      if (elementStack.length === 0) {
        return false;
      }
      const end = findDelimitedMarkupEnd(text, cursor + 9, ']]>', boundary);
      if (end === -1) {
        return false;
      }
      cursor = end;
      continue;
    }
    if (text.startsWith('<?', cursor)) {
      if (elementStack.length === 0 || isXmlDeclarationTarget(text, cursor, boundary)) {
        return false;
      }
      const end = findDelimitedMarkupEnd(text, cursor + 2, '?>', boundary);
      if (end === -1) {
        return false;
      }
      cursor = end;
      continue;
    }
    if (text.startsWith('<!', cursor)) {
      return false;
    }

    const element = parseElementToken(text, cursor, boundary);
    if (element === false) {
      return false;
    }
    cursor = element.end;
    if (element.kind === 'open') {
      if (elementStack.length === 0) {
        if (sawRoot || element.name.toLowerCase() !== 'svg') {
          return false;
        }
        sawRoot = true;
      }
      if (!element.selfClosing) {
        elementStack.push(element.name);
      }
      continue;
    }
    if (
      elementStack.length === 0 ||
      elementStack[elementStack.length - 1] !== element.name
    ) {
      return false;
    }
    elementStack.pop();
  }
  return sawRoot && elementStack.length === 0;
}

/**
 * Return whether output is one complete well-formed UTF-8 SVG document.
 *
 * The validator decodes once, accepts only a restricted XML prologue, anchors
 * the first element to SVG, and tracks every opening element on an exact-name
 * stack so mismatched or incomplete nesting fails closed.
 *
 * @param {Buffer} output - Bounded renderer output.
 * @returns {boolean} True for exactly one complete SVG document.
 */
function isValidSvg(output) {
  let text;
  try {
    text = utf8Decoder.decode(output);
  } catch {
    return false;
  }

  const first = skipDocumentWhitespace(text, 0, text.length, 1);
  const boundary = skipDocumentWhitespace(text, text.length, first, -1);
  if (first === boundary) {
    return false;
  }
  const rootStart = skipSvgPrologue(text, first, boundary);
  return rootStart !== false && rootStart !== boundary
    ? scanSvgElementTree(text, rootStart, boundary)
    : false;
}

/**
 * Validate output bytes for the requested media type.
 *
 * @param {Buffer} output - Bounded renderer output.
 * @param {'png'|'svg'} format - Requested output format.
 * @returns {boolean} True when the output has the expected complete structure.
 */
function isValidOutput(output, format) {
  return format === 'png' ? isValidPng(output) : isValidSvg(output);
}

/**
 * Create an immutable JSON-serializable render artifact.
 *
 * Base64 avoids exposing a mutable Buffer through the public package boundary
 * and can cross worker, process, or service contracts without custom encoding.
 *
 * @param {Buffer} output - Valid bounded renderer bytes.
 * @param {'png'|'svg'} format - Output format.
 * @param {string} source - Exact rendered source.
 * @returns {Readonly<object>} Immutable artifact metadata and encoded content.
 */
function createArtifact(output, format, source) {
  return Object.freeze({
    format,
    mediaType: format === 'png' ? 'image/png' : 'image/svg+xml',
    encoding: 'base64',
    dataBase64: output.toString('base64'),
    byteLength: output.byteLength,
    sourceRevisionHash: hashSource(source),
  });
}

/**
 * Render one request through an isolated PlantUML child process.
 *
 * The process receives source only on stdin. It runs without a shell, with an
 * empty environment, in the JAR directory, and with PlantUML SANDBOX plus
 * metadata suppression. stdout and stderr are independently bounded. Public
 * errors never contain source or raw child diagnostics.
 *
 * @param {Readonly<object>} options - Normalized renderer options.
 * @param {Readonly<{source: string, sourceBytes: Buffer, format: 'png'|'svg'}>} request - Normalized request.
 * @returns {Promise<Readonly<object>>} Valid immutable render artifact.
 */
function renderRequest(options, request) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = options.spawnImpl(options.javaPath, buildArguments(options, request.format), {
        cwd: dirname(options.jarPath),
        env: {},
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      reject(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer process could not be started.',
        ),
      );
      return;
    }

    if (
      child === null ||
      typeof child !== 'object' ||
      child.stdin === undefined ||
      typeof child.stdin.on !== 'function' ||
      typeof child.stdin.end !== 'function' ||
      child.stdout === undefined ||
      typeof child.stdout.on !== 'function' ||
      child.stderr === undefined ||
      typeof child.stderr.on !== 'function' ||
      typeof child.once !== 'function' ||
      typeof child.kill !== 'function'
    ) {
      reject(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer process returned an invalid process handle.',
        ),
      );
      return;
    }

    let settled = false;
    let outputBytes = 0;
    let diagnosticBytes = 0;
    const outputChunks = [];
    const diagnosticChunks = [];
    const timer = setTimeout(() => {
      fail(
        new PlantUmlRendererError(
          'renderer_timeout',
          'The PlantUML renderer exceeded the configured timeout.',
        ),
        true,
      );
    }, options.timeoutMs);

    /**
     * Clear the deadline after a terminal result.
     *
     * @returns {void}
     */
    function cleanup() {
      clearTimeout(timer);
    }

    /**
     * Reject exactly once and optionally terminate the child.
     *
     * @param {PlantUmlRendererError} error - Safe terminal error.
     * @param {boolean} terminate - Whether to send SIGKILL to the child.
     * @returns {void}
     */
    function fail(error, terminate = false) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (terminate) {
        try {
          child.kill('SIGKILL');
        } catch {
          // The original bounded failure remains authoritative when kill races.
        }
      }
      reject(error);
    }

    /**
     * Resolve exactly once with a valid artifact.
     *
     * @param {Readonly<object>} artifact - Completed artifact.
     * @returns {void}
     */
    function succeed(artifact) {
      settled = true;
      cleanup();
      resolve(artifact);
    }

    child.stdout.on('data', (chunk) => {
      if (settled) {
        return;
      }
      const bytes = Buffer.from(chunk);
      outputBytes += bytes.byteLength;
      if (outputBytes > options.maxOutputBytes) {
        fail(
          new PlantUmlRendererError(
            'renderer_output_too_large',
            'The PlantUML renderer exceeded the configured output limit.',
            { stream: 'stdout' },
          ),
          true,
        );
        return;
      }
      outputChunks.push(bytes);
    });

    child.stderr.on('data', (chunk) => {
      if (settled) {
        return;
      }
      const bytes = Buffer.from(chunk);
      diagnosticBytes += bytes.byteLength;
      if (diagnosticBytes > options.maxDiagnosticBytes) {
        fail(
          new PlantUmlRendererError(
            'renderer_output_too_large',
            'The PlantUML renderer exceeded the configured diagnostic limit.',
            { stream: 'stderr' },
          ),
          true,
        );
        return;
      }
      diagnosticChunks.push(bytes);
    });

    child.stdout.on('error', () => {
      fail(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer output stream failed.',
        ),
        true,
      );
    });

    child.stderr.on('error', () => {
      fail(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer diagnostic stream failed.',
        ),
        true,
      );
    });

    child.once('error', () => {
      fail(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer process could not be started.',
        ),
      );
    });

    child.once('close', (exitCode, signal) => {
      if (settled) {
        return;
      }
      const standardReport = parsePlantUmlStandardReport(
        Buffer.concat(diagnosticChunks, diagnosticBytes),
      );
      if (
        exitCode !== 0 ||
        signal !== null ||
        standardReport.status === 'error' ||
        standardReport.status === 'invalid'
      ) {
        const details = { diagnostics: standardReport.diagnostics };
        if (Number.isInteger(exitCode)) {
          details.exitCode = exitCode;
        }
        if (typeof signal === 'string') {
          details.signal = signal;
        }
        fail(
          new PlantUmlRendererError(
            'renderer_failed',
            'PlantUML rejected the source or failed to render it.',
            details,
          ),
        );
        return;
      }
      const output = Buffer.concat(outputChunks, outputBytes);
      if (!isValidOutput(output, request.format)) {
        fail(
          new PlantUmlRendererError(
            'renderer_output_invalid',
            'PlantUML returned output that does not match the requested format.',
          ),
        );
        return;
      }
      succeed(createArtifact(output, request.format, request.source));
    });

    child.stdin.on('error', () => {
      fail(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer process could not receive source input.',
        ),
        true,
      );
    });

    try {
      child.stdin.end(request.sourceBytes);
    } catch {
      fail(
        new PlantUmlRendererError(
          'renderer_unavailable',
          'The PlantUML renderer process could not receive source input.',
        ),
        true,
      );
    }
  });
}

/**
 * Create a local, sandboxed PlantUML renderer.
 *
 * Hosts supply absolute Java and PlantUML JAR paths so this package does not
 * bundle or silently download an executable. The returned renderer is frozen,
 * performs no logging or persistence, and exposes one asynchronous `render`
 * operation. `spawnImpl` exists only as a deterministic test seam; production
 * hosts must omit it so Node.js `spawn` enforces the fixed process contract.
 *
 * @param {unknown} options - Absolute paths, byte limits, timeout, and optional test seam.
 * @returns {Readonly<{render(request: unknown): Promise<Readonly<object>>}>} Frozen renderer client.
 * @throws {PlantUmlRendererError} When construction options are unsafe or invalid.
 */
export function createPlantUmlRenderer(options) {
  const normalized = normalizeOptions(options);
  return Object.freeze({
    /**
     * Render one bounded PlantUML source as SVG or PNG.
     *
     * @param {unknown} request - Plain object containing source and optional format.
     * @returns {Promise<Readonly<object>>} Immutable base64 artifact.
     */
    async render(request) {
      return renderRequest(normalized, normalizeRequest(request, normalized.maxSourceBytes));
    },
  });
}
