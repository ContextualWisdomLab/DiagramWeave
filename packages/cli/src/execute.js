import { TextDecoder } from 'node:util';

import { cliExitCodes, CliError } from './errors.js';
import {
  discoverDiagramInputs as defaultDiscoverDiagramInputs,
  planRenderOutputs as defaultPlanRenderOutputs,
  publishArtifact as defaultPublishArtifact,
} from './files.js';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const safeCode = /^[a-z][a-z0-9_]*$/u;
const unsafeMessageCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

/**
 * Freeze one CLI execution report and every owned nested record.
 *
 * @param {object} report - Mutable report data.
 * @returns {Readonly<object>} Deeply frozen report.
 */
function freezeReport(report) {
  const files = Object.freeze(report.files.map((file) => Object.freeze(file)));
  return Object.freeze({
    ...report,
    totals: Object.freeze({ ...report.totals }),
    files,
  });
}

/**
 * Return safe structured error data without exposing dynamic exception content.
 *
 * @param {unknown} error - Candidate failure.
 * @param {string} fallbackCode - Stable fallback code.
 * @param {string} fallbackMessage - Stable fallback message.
 * @returns {{code: string, message: string}} Safe error data.
 */
function safeFailure(error, fallbackCode, fallbackMessage) {
  if (
    error !== null &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    safeCode.test(error.code) &&
    typeof error.message === 'string' &&
    error.message.length > 0 &&
    error.message.length <= 512 &&
    !unsafeMessageCharacters.test(error.message)
  ) {
    return { code: error.code, message: error.message };
  }
  return { code: fallbackCode, message: fallbackMessage };
}

/**
 * Create one immutable invocation-failure report.
 *
 * @param {string|null} command - Parsed command kind when available.
 * @param {unknown} error - Expected or unexpected failure.
 * @returns {Readonly<object>} Frozen source-free report.
 */
export function createInvocationReport(command, error) {
  const failure = safeFailure(
    error,
    'internal_cli_error',
    'DiagramWeave CLI encountered an internal failure.',
  );
  return freezeReport({
    schemaVersion: 1,
    command,
    status: 'invocation_failure',
    exitCode: cliExitCodes.invocationFailure,
    format: null,
    inputKind: null,
    helpTopic: null,
    errorCode: failure.code,
    errorMessage: failure.message,
    totals: { selected: 0, succeeded: 0, failed: 0 },
    files: [],
  });
}

/**
 * Create one immutable help report.
 *
 * @param {string|null} topic - Optional command topic.
 * @returns {Readonly<object>} Frozen help report.
 */
function createHelpReport(topic) {
  return freezeReport({
    schemaVersion: 1,
    command: 'help',
    status: 'success',
    exitCode: cliExitCodes.success,
    format: null,
    inputKind: null,
    helpTopic: topic,
    errorCode: null,
    errorMessage: null,
    totals: { selected: 0, succeeded: 0, failed: 0 },
    files: [],
  });
}

/**
 * Decode one renderer artifact and fail closed on an inconsistent contract.
 *
 * @param {unknown} artifact - Renderer artifact.
 * @param {'svg'|'png'} format - Requested format.
 * @returns {{bytes: Buffer, sourceRevisionHash: string}} Decoded artifact data.
 */
function decodeArtifact(artifact, format) {
  if (
    artifact === null ||
    typeof artifact !== 'object' ||
    artifact.format !== format ||
    artifact.encoding !== 'base64' ||
    typeof artifact.dataBase64 !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      artifact.dataBase64,
    ) ||
    typeof artifact.byteLength !== 'number' ||
    typeof artifact.sourceRevisionHash !== 'string' ||
    artifact.sourceRevisionHash.length === 0
  ) {
    throw new CliError('internal_cli_error', 'The renderer returned an invalid artifact contract.');
  }
  const bytes = Buffer.from(artifact.dataBase64, 'base64');
  if (bytes.byteLength !== artifact.byteLength) {
    throw new CliError('internal_cli_error', 'The renderer returned an invalid artifact length.');
  }
  return { bytes, sourceRevisionHash: artifact.sourceRevisionHash };
}

/**
 * Create one failed per-file result.
 *
 * @param {object} input - Discovered input.
 * @param {string|null} outputPath - Safe relative output path.
 * @param {unknown} error - Failure to sanitize.
 * @param {string} fallbackCode - Stable fallback code.
 * @param {string} fallbackMessage - Stable fallback message.
 * @param {string|null} sourceRevisionHash - Trusted renderer hash when an artifact existed.
 * @returns {object} Mutable safe file result.
 */
function failedFile(
  input,
  outputPath,
  error,
  fallbackCode,
  fallbackMessage,
  sourceRevisionHash = null,
) {
  const failure = safeFailure(error, fallbackCode, fallbackMessage);
  return {
    relativePath: input.relativePath,
    status: 'failed',
    sourceRevisionHash,
    outputPath,
    errorCode: failure.code,
    errorMessage: failure.message,
  };
}

/**
 * Execute one immutable DiagramWeave CLI command through injected runtime boundaries.
 *
 * @param {Readonly<object>} command - Parsed command contract.
 * @param {object} runtime - Filesystem, renderer, and optional function overrides.
 * @returns {Promise<Readonly<object>>} Frozen execution report.
 */
export async function executeDiagramWeaveCli(command, runtime) {
  if (command.kind === 'help') {
    return createHelpReport(command.topic);
  }
  if (runtime === null || typeof runtime !== 'object') {
    return createInvocationReport(command.kind, new CliError(
      'internal_cli_error',
      'The CLI runtime is unavailable.',
    ));
  }

  const discoverDiagramInputs = runtime.discoverDiagramInputs ?? defaultDiscoverDiagramInputs;
  const planRenderOutputs = runtime.planRenderOutputs ?? defaultPlanRenderOutputs;
  const publishArtifact = runtime.publishArtifact ?? defaultPublishArtifact;

  let discovery;
  let plan = null;
  let renderer;
  try {
    discovery = await discoverDiagramInputs(command.inputPath, runtime.fileSystem);
    if (command.kind === 'render') {
      plan = await planRenderOutputs(
        discovery.inputs,
        discovery.inputKind,
        command.outputPath,
        command.format,
        command.overwrite,
        runtime.fileSystem,
      );
    }
    renderer = runtime.rendererFactory({
      javaPath: command.javaPath,
      jarPath: command.jarPath,
    });
    if (renderer === null || typeof renderer !== 'object' || typeof renderer.render !== 'function') {
      throw new CliError('renderer_unavailable', 'The renderer factory returned an invalid renderer.');
    }
  } catch (error) {
    return createInvocationReport(command.kind, error);
  }

  const files = [];
  let operationalFailure = false;
  for (let index = 0; index < discovery.inputs.length; index += 1) {
    const input = discovery.inputs[index];
    const destination = plan === null ? null : plan.destinations[index];
    let source;
    try {
      const sourceBytes = await runtime.fileSystem.readFile(input.absolutePath);
      source = utf8Decoder.decode(sourceBytes);
    } catch (error) {
      files.push(failedFile(
        input,
        destination === null ? null : destination.outputPath,
        error,
        'input_read_failed',
        'The diagram source could not be read as UTF-8.',
      ));
      operationalFailure = true;
      continue;
    }

    let artifact;
    try {
      artifact = await renderer.render({ source, format: command.format });
    } catch (error) {
      files.push(failedFile(
        input,
        destination === null ? null : destination.outputPath,
        error,
        'renderer_failed',
        'The diagram could not be rendered.',
      ));
      continue;
    }

    let decoded;
    try {
      decoded = decodeArtifact(artifact, command.format);
      if (destination !== null) {
        await publishArtifact(
          destination,
          decoded.bytes,
          command.overwrite,
          runtime.fileSystem,
        );
      }
    } catch (error) {
      files.push(failedFile(
        input,
        destination === null ? null : destination.outputPath,
        error,
        'output_write_failed',
        'The rendered artifact could not be published.',
        decoded === undefined ? null : decoded.sourceRevisionHash,
      ));
      operationalFailure = true;
      continue;
    }

    files.push({
      relativePath: input.relativePath,
      status: destination === null ? 'valid' : 'rendered',
      sourceRevisionHash: decoded.sourceRevisionHash,
      outputPath: destination === null ? null : destination.outputPath,
      errorCode: null,
      errorMessage: null,
    });
  }

  const failed = files.filter((file) => file.status === 'failed').length;
  const succeeded = files.length - failed;
  const status = operationalFailure
    ? 'invocation_failure'
    : failed > 0
      ? 'diagram_failure'
      : 'success';
  const exitCode = operationalFailure
    ? cliExitCodes.invocationFailure
    : failed > 0
      ? cliExitCodes.diagramFailure
      : cliExitCodes.success;
  return freezeReport({
    schemaVersion: 1,
    command: command.kind,
    status,
    exitCode,
    format: command.format,
    inputKind: discovery.inputKind,
    helpTopic: null,
    errorCode: null,
    errorMessage: null,
    totals: {
      selected: files.length,
      succeeded,
      failed,
    },
    files,
  });
}
