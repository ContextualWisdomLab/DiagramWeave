import { isAbsolute } from 'node:path';

import { CliError } from './errors.js';

const controlCharacters = /[\u0000-\u001f\u007f]/u;
const commands = new Set(['validate', 'render']);
const valueOptions = new Set(['--output', '--java', '--jar', '--format']);
const booleanOptions = new Set(['--json', '--overwrite']);

/**
 * Return whether a value is a plain record.
 *
 * @param {unknown} value - Candidate value.
 * @returns {boolean} True only for Object or null-prototype records.
 */
function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validate one source-free CLI string.
 *
 * @param {unknown} value - Candidate string.
 * @param {string} field - Stable field name.
 * @param {string} code - Stable error code.
 * @returns {string} Valid nonempty string.
 */
function requireSafeString(value, field, code) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliError(code, `${field} must be a nonempty string.`, { field });
  }
  if (controlCharacters.test(value)) {
    throw new CliError(code, `${field} must not contain control characters.`, { field });
  }
  return value;
}

/**
 * Read one renderer path from an option or environment fallback.
 *
 * @param {string|undefined} optionValue - Explicit option value.
 * @param {unknown} environmentValue - Environment fallback.
 * @param {string} field - Stable field name.
 * @returns {string} Absolute renderer path.
 */
function rendererPath(optionValue, environmentValue, field) {
  const candidate = optionValue === undefined
    ? requireSafeString(environmentValue, field, 'invalid_cli_environment')
    : optionValue;
  if (!isAbsolute(candidate)) {
    throw new CliError(
      optionValue === undefined ? 'invalid_cli_environment' : 'invalid_cli_arguments',
      `${field} must be an absolute path.`,
      { field },
    );
  }
  return candidate;
}

/**
 * Return the immutable help command for an optional topic.
 *
 * @param {'validate'|'render'|null} topic - Optional command topic.
 * @returns {Readonly<object>} Frozen help command.
 */
function helpCommand(topic) {
  return Object.freeze({
    kind: 'help',
    topic,
    inputPath: null,
    outputPath: null,
    javaPath: null,
    jarPath: null,
    format: null,
    overwrite: false,
    json: false,
    help: true,
  });
}

/**
 * Parse strict DiagramWeave CLI arguments without reading global process state.
 *
 * @param {unknown} argv - `process.argv.slice(2)`-shaped arguments.
 * @param {unknown} environment - Plain environment record used only for renderer path fallbacks.
 * @returns {Readonly<object>} Deeply immutable command contract.
 * @throws {CliError} When arguments or renderer configuration are invalid.
 */
export function parseCliArguments(argv, environment) {
  if (!Array.isArray(argv)) {
    throw new CliError('invalid_cli_arguments', 'argv must be an array.', { field: 'argv' });
  }
  for (const value of argv) {
    requireSafeString(value, 'argument', 'invalid_cli_arguments');
  }

  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help')) {
    return helpCommand(null);
  }
  if (
    argv.length === 2 &&
    commands.has(argv[0]) &&
    (argv[1] === '--help' || argv[1] === '-h')
  ) {
    return helpCommand(argv[0]);
  }
  if (argv.length === 0) {
    throw new CliError('invalid_cli_arguments', 'A command is required.', { field: 'command' });
  }

  const kind = argv[0];
  if (!commands.has(kind)) {
    throw new CliError('invalid_cli_arguments', 'Command must be validate or render.', {
      field: 'command',
    });
  }
  if (!isPlainRecord(environment)) {
    throw new CliError('invalid_cli_environment', 'environment must be a plain object.', {
      field: 'environment',
    });
  }

  const options = Object.create(null);
  const seen = new Set();
  const positionals = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    if (!valueOptions.has(token) && !booleanOptions.has(token)) {
      throw new CliError('invalid_cli_arguments', 'Unknown option.', { field: token });
    }
    if (seen.has(token)) {
      throw new CliError('invalid_cli_arguments', 'Options may not be repeated.', { field: token });
    }
    seen.add(token);
    if (booleanOptions.has(token)) {
      options[token] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError('invalid_cli_arguments', 'Option value is required.', { field: token });
    }
    options[token] = requireSafeString(value, token, 'invalid_cli_arguments');
    index += 1;
  }

  if (positionals.length !== 1) {
    throw new CliError(
      'invalid_cli_arguments',
      positionals.length === 0 ? 'An input path is required.' : 'Only one input path is allowed.',
      { field: 'input' },
    );
  }

  const inputPath = requireSafeString(positionals[0], 'input', 'invalid_cli_arguments');
  const javaPath = rendererPath(
    options['--java'],
    environment.DIAGRAMWEAVE_JAVA_PATH,
    'javaPath',
  );
  const jarPath = rendererPath(
    options['--jar'],
    environment.DIAGRAMWEAVE_PLANTUML_JAR_PATH,
    'jarPath',
  );
  const format = options['--format'] === undefined ? 'svg' : options['--format'];
  if (format !== 'svg' && format !== 'png') {
    throw new CliError('invalid_cli_arguments', 'format must be svg or png.', {
      field: 'format',
    });
  }

  const outputPath = options['--output'] ?? null;
  const overwrite = options['--overwrite'] === true;
  if (kind === 'validate' && (outputPath !== null || seen.has('--format') || overwrite)) {
    throw new CliError(
      'invalid_cli_arguments',
      'validate does not accept render-only options.',
      { field: 'command' },
    );
  }
  if (kind === 'render' && outputPath === null) {
    throw new CliError('output_required', 'render requires --output.', { field: 'output' });
  }

  return Object.freeze({
    kind,
    inputPath,
    outputPath,
    javaPath,
    jarPath,
    format,
    overwrite,
    json: options['--json'] === true,
    help: false,
  });
}
