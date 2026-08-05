import { createLanguageServerStdioConnection } from './connection.js';
import { LanguageServerStdioError } from './errors.js';

/**
 * Return whether a value is a plain process options record.
 *
 * @param {unknown} value - Candidate record.
 * @returns {boolean} True for Object- or null-prototype records.
 */
function isPlainRecord(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/**
 * Write one framed byte buffer and wait for the stream callback.
 *
 * @param {object} output - Node-style writable stream.
 * @param {Uint8Array} bytes - Complete JSON-RPC frame.
 * @returns {Promise<void>}
 */
export function writeStdioBytes(output, bytes) {
  return new Promise((resolve, reject) => {
    let callbackCalled = false;
    try {
      output.write(bytes, (error) => {
        if (callbackCalled) {
          return;
        }
        callbackCalled = true;
        if (error) {
          reject(new LanguageServerStdioError(
            'output_failed',
            'The stdio output stream failed.',
            { fatal: true },
          ));
        } else {
          resolve();
        }
      });
    } catch {
      reject(new LanguageServerStdioError(
        'output_failed',
        'The stdio output stream failed.',
        { fatal: true },
      ));
    }
  });
}

/**
 * Run the DiagramWeave JSON-RPC connection on Node-style input/output streams.
 *
 * The process boundary pauses input around each asynchronous chunk, removes all
 * listeners on termination, never calls `process.exit`, and resolves only after
 * the LSP connection reports an exit code. Configuration failures write one
 * fixed line to stderr and return code one without exposing environment values.
 *
 * @param {unknown} [options] - Optional streams, environment, exit setter, and deterministic test seams.
 * @returns {Promise<number>} Final process-style exit code.
 */
export async function runLanguageServerStdioProcess(options) {
  if (!isPlainRecord(options)) {
    return 1;
  }
  let input;
  let output;
  let stderr;
  let environment;
  let setExitCode;
  let rendererFactory;
  let sessionFactory;
  try {
    input = options.input;
    output = options.output;
    stderr = options.stderr;
    environment = options.environment;
    setExitCode = options.setExitCode;
    rendererFactory = options.rendererFactory;
    sessionFactory = options.sessionFactory;
  } catch {
    return 1;
  }
  const validStreams =
    input !== null && typeof input === 'object' &&
    output !== null && typeof output === 'object' &&
    stderr !== null && typeof stderr === 'object' &&
    typeof input.on === 'function' &&
    typeof input.off === 'function' &&
    typeof output.write === 'function' &&
    typeof stderr.write === 'function' &&
    typeof setExitCode === 'function' &&
    isPlainRecord(environment);
  if (!validStreams) {
    return 1;
  }

  let javaPath;
  let jarPath;
  try {
    javaPath = environment.DIAGRAMWEAVE_JAVA_PATH;
    jarPath = environment.DIAGRAMWEAVE_PLANTUML_JAR_PATH;
  } catch {
    try {
      stderr.write('DiagramWeave Language Server configuration failed.\n');
      setExitCode(1);
    } catch {
      // Configuration reporting is best-effort.
    }
    return 1;
  }

  return new Promise((resolve) => {
    let settled = false;
    let connection;

    /**
     * Remove all process-stream listeners installed by this runner.
     *
     * @returns {void}
     */
    function cleanup() {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
    }

    /**
     * Complete the process runner exactly once.
     *
     * @param {number} code - Final exit code.
     * @returns {void}
     */
    function finish(code) {
      settled = true;
      cleanup();
      try {
        setExitCode(code);
      } catch {
        // Exit-code adapters are outside the protocol boundary.
      }
      resolve(code);
    }

    /**
     * Handle one stream data event with input flow paused.
     *
     * @param {unknown} chunk - Incoming stream chunk.
     * @returns {void}
     */
    function onData(chunk) {
      try {
        input.pause?.();
      } catch {
        connection.abort();
        return;
      }
      connection.acceptChunk(chunk).catch(() => {
        connection.abort();
      }).finally(() => {
        if (!settled) {
          try {
            input.resume?.();
          } catch {
            connection.abort();
          }
        }
      });
    }

    /**
     * Handle clean input EOF.
     *
     * @returns {void}
     */
    function onEnd() {
      connection.end().catch(() => {
        connection.abort();
      });
    }

    /**
     * Handle an input stream failure without exposing it.
     *
     * @returns {void}
     */
    function onError() {
      connection.abort();
    }

    try {
      connection = createLanguageServerStdioConnection({
        javaPath,
        jarPath,
        rendererFactory,
        sessionFactory,
        writeBytes: (bytes) => writeStdioBytes(output, bytes),
        onExit: finish,
      });
    } catch {
      try {
        stderr.write('DiagramWeave Language Server configuration failed.\n');
      } catch {
        // Configuration reporting is best-effort.
      }
      finish(1);
      return;
    }

    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
    try {
      input.resume?.();
    } catch {
      connection.abort();
    }
  });
}
