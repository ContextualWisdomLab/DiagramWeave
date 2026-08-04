import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from 'node:fs/promises';

import { createPlantUmlRenderer } from '@contextualwisdomlab/diagramweave-plantuml-renderer';

import { parseCliArguments } from './arguments.js';
import { cliExitCodes, CliError } from './errors.js';
import { createInvocationReport, executeDiagramWeaveCli } from './execute.js';
import { formatCliReport } from './presentation.js';

const nodeFileSystem = Object.freeze({
  cwd: () => process.cwd(),
  lstat,
  readdir,
  readFile,
  mkdir,
  open,
  rename,
  unlink,
});

/**
 * Return whether a value is a plain options record.
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
 * Run DiagramWeave CLI logic without exiting the host process.
 *
 * @param {unknown} argv - `process.argv.slice(2)`-shaped arguments.
 * @param {unknown} [options] - Optional environment, filesystem, renderer, and test seams.
 * @returns {Promise<Readonly<object>>} Frozen execution report.
 */
export async function runDiagramWeaveCli(argv, options = {}) {
  if (!isPlainRecord(options)) {
    return createInvocationReport(null, new CliError(
      'internal_cli_error',
      'CLI options must be a plain object.',
    ));
  }

  let command;
  try {
    const environment = options.environment === undefined
      ? { ...process.env }
      : options.environment;
    command = parseCliArguments(argv, environment);
  } catch (error) {
    return createInvocationReport(null, error);
  }

  try {
    return await executeDiagramWeaveCli(command, {
      fileSystem: options.fileSystem ?? nodeFileSystem,
      rendererFactory: options.rendererFactory ?? createPlantUmlRenderer,
      discoverDiagramInputs: options.discoverDiagramInputs,
      planRenderOutputs: options.planRenderOutputs,
      publishArtifact: options.publishArtifact,
    });
  } catch (error) {
    return createInvocationReport(command.kind, error);
  }
}

export { CliError, cliExitCodes, formatCliReport, parseCliArguments };
