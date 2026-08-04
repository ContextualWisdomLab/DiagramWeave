import { spawn } from 'node:child_process';
import { dirname, isAbsolute, normalize } from 'node:path';
import { TextDecoder } from 'node:util';

import { hashSource } from '@contextualwisdomlab/diagramweave-core';

import { PlantUmlRendererError } from './errors.js';
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
 * Return whether the character following an XML name ends that name.
 *
 * @param {string|undefined} character - Character after the candidate name.
 * @returns {boolean} True for whitespace, slash, or closing angle bracket.
 */
function isXmlNameBoundary(character) {
  return (
    character === '>' ||
    character === '/' ||
    (character !== undefined && isDocumentWhitespace(character))
  );
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
 * Return whether one complete opening tag uses the XML empty-element marker.
 *
 * XML permits whitespace before `/>`, but not between the slash and closing
 * angle bracket, so the character immediately before `>` is authoritative.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} end - Closing angle-bracket index.
 * @returns {boolean} True when the opening tag ends with `/>`.
 */
function isSelfClosingTag(text, end) {
  return text[end - 1] === '/';
}

/**
 * Scan to the next actual SVG tag, skipping comments, CDATA, instructions, and other tags.
 *
 * @param {string} text - Decoded candidate document.
 * @param {number} index - Scan start.
 * @param {number} boundary - Exclusive document boundary.
 * @returns {{kind: 'open'|'close', start: number, end: number, selfClosing: boolean}|null|false} Tag, no tag, or malformed markup.
 */
function findNextSvgTag(text, index, boundary) {
  let cursor = index;
  while (cursor < boundary) {
    const start = text.indexOf('<', cursor);
    if (start === -1 || start >= boundary) {
      return null;
    }
    if (text.startsWith('<!--', start)) {
      const commentEnd = text.indexOf('-->', start + 4);
      if (commentEnd === -1 || commentEnd + 3 > boundary) {
        return false;
      }
      cursor = commentEnd + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', start)) {
      const cdataEnd = text.indexOf(']]>', start + 9);
      if (cdataEnd === -1 || cdataEnd + 3 > boundary) {
        return false;
      }
      cursor = cdataEnd + 3;
      continue;
    }
    if (text.startsWith('<?', start)) {
      const instructionEnd = text.indexOf('?>', start + 2);
      if (instructionEnd === -1 || instructionEnd + 2 > boundary) {
        return false;
      }
      cursor = instructionEnd + 2;
      continue;
    }

    const tagEnd = findTagEnd(text, start + 1, boundary);
    if (tagEnd === -1) {
      return false;
    }
    const isClose = matchesAsciiToken(text, start, '</svg');
    const isOpen = matchesAsciiToken(text, start, '<svg');
    if (
      (isClose && isXmlNameBoundary(text[start + 5])) ||
      (isOpen && isXmlNameBoundary(text[start + 4]))
    ) {
      return {
        kind: isClose ? 'close' : 'open',
        start,
        end: tagEnd,
        selfClosing: !isClose && isSelfClosingTag(text, tagEnd),
      };
    }
    cursor = tagEnd + 1;
  }
  return null;
}

/**
 * Return whether output is one complete UTF-8 SVG document.
 *
 * The validator decodes once, scans only the leading/trailing whitespace and
 * then performs one markup pass. Nested SVG elements are valid, but a second
 * top-level SVG document or malformed markup is rejected.
 *
 * @param {Buffer} output - Bounded renderer output.
 * @returns {boolean} True for exactly one complete SVG root.
 */
function isValidSvg(output) {
  let text;
  try {
    text = utf8Decoder.decode(output);
  } catch {
    return false;
  }

  let start = skipDocumentWhitespace(text, 0, text.length, 1);
  const end = skipDocumentWhitespace(text, text.length, start, -1);
  if (start === end) {
    return false;
  }
  if (matchesAsciiToken(text, start, '<?xml')) {
    const declarationEnd = text.indexOf('?>', start + 5);
    if (declarationEnd === -1 || declarationEnd + 2 > end) {
      return false;
    }
    start = skipDocumentWhitespace(text, declarationEnd + 2, end, 1);
  }

  const root = findNextSvgTag(text, start, end);
  if (root === false || root === null || root.start !== start || root.kind !== 'open') {
    return false;
  }
  if (root.selfClosing) {
    return root.end + 1 === end;
  }

  let depth = 1;
  let cursor = root.end + 1;
  while (cursor < end) {
    const tag = findNextSvgTag(text, cursor, end);
    if (tag === false || tag === null) {
      return false;
    }
    cursor = tag.end + 1;
    if (tag.kind === 'open' && !tag.selfClosing) {
      depth += 1;
    } else if (tag.kind === 'close') {
      depth -= 1;
      if (depth === 0) {
        return cursor === end;
      }
    }
  }
  return false;
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
 * Inspect the bounded PlantUML standard report without exposing its contents.
 *
 * The `-stdrpt:1` protocol emits line-oriented `status=OK` or
 * `status=ERROR` fields. An error field wins even when another status line is
 * present. Empty or older-version diagnostic output remains `unknown` so
 * successful rendering does not depend on stderr being nonempty. Invalid
 * UTF-8 fails closed because the report cannot be interpreted safely.
 *
 * @param {Buffer} diagnostics - Bounded stderr bytes from PlantUML.
 * @returns {'ok'|'error'|'unknown'|'invalid'} Interpreted standard-report state.
 */
function inspectStandardReport(diagnostics) {
  let text;
  try {
    text = utf8Decoder.decode(diagnostics);
  } catch {
    return 'invalid';
  }
  let status = 'unknown';
  for (const line of text.split(/\r?\n/u)) {
    if (line === 'status=ERROR') {
      return 'error';
    }
    if (line === 'status=OK') {
      status = 'ok';
    }
  }
  return status;
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
      const diagnosticStatus = inspectStandardReport(
        Buffer.concat(diagnosticChunks, diagnosticBytes),
      );
      if (
        exitCode !== 0 ||
        signal !== null ||
        diagnosticStatus === 'error' ||
        diagnosticStatus === 'invalid'
      ) {
        const details = {};
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
